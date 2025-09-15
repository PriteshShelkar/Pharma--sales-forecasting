import os
import io
import sys
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model
from sklearn.metrics import mean_absolute_error, mean_squared_error

# ------------------ CONFIG ------------------
PORT = 7000
SEQ_LEN = int(os.getenv("SEQ_LEN", 168))  # 7 days of hourly history
PRODUCT_COLS = ["M01AB","M01AE","N02BA","N02BE","N05B","N05C","R03","R06"]
DATE_COL = "datum"  # incoming CSV datetime column

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "pharma_lstm_model.h5")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.pkl")

# ------------------ APP ------------------
app = Flask(__name__)
CORS(app)

# Remove any references to non-existent classes/imports
# (PharmaSalesLSTMPredictor, DataProcessor, Mongo, etc.)

# Load artifacts once at startup
try:
    model = load_model(MODEL_PATH, compile=False)
    # Re-compile to be safe (Keras 3.x friendly)
    model.compile(optimizer="adam", loss="mse")
except Exception as e:
    raise RuntimeError(f"Failed to load model at {MODEL_PATH}: {e}")

try:
    scaler = joblib.load(SCALER_PATH)
except Exception as e:
    raise RuntimeError(f"Failed to load scaler at {SCALER_PATH}: {e}")

# ------------------ HELPERS ------------------

def _read_csv_from_request(file_storage) -> pd.DataFrame:
    # Try utf-8 first, then fallback
    try:
        return pd.read_csv(file_storage)
    except UnicodeDecodeError:
        file_storage.stream.seek(0)
        return pd.read_csv(io.TextIOWrapper(file_storage.stream, encoding="latin1"))


def _prep_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    # Normalize column names (strip, exact matches for PRODUCT_COLS retained as-is)
    df = df.copy()
    # Ensure the date column exists
    if DATE_COL not in df.columns:
        # try case-insensitive match
        candidates = [c for c in df.columns if c.strip().lower() == DATE_COL.lower()]
        if not candidates:
            raise ValueError(f"CSV must contain a '{DATE_COL}' column.")
        df.rename(columns={candidates[0]: DATE_COL}, inplace=True)

    # Parse dates and sort
    df[DATE_COL] = pd.to_datetime(df[DATE_COL])
    df = df.sort_values(DATE_COL).reset_index(drop=True)

    # Check feature columns
    missing = [c for c in PRODUCT_COLS if c not in df.columns]
    if missing:
        raise ValueError(
            "CSV is missing required product columns: " + ", ".join(missing)
        )

    # Keep only needed columns
    cols = [DATE_COL] + PRODUCT_COLS
    df = df[cols]

    # Drop rows with all-NaN in product cols; fill remaining NaNs with 0
    prods = df[PRODUCT_COLS]
    df = df.loc[~prods.isna().all(axis=1)].copy()
    df[PRODUCT_COLS] = df[PRODUCT_COLS].fillna(0.0)

    return df


def _multi_step_forecast(last_seq_scaled: np.ndarray, horizon: int) -> np.ndarray:
    """Recursive multi-variate forecasting on scaled space.
    last_seq_scaled: (SEQ_LEN, n_features)
    return: (horizon, n_features) in original scale (after inverse_transform)
    """
    n_feat = last_seq_scaled.shape[1]
    seq = last_seq_scaled.copy()
    preds_scaled = []
    for _ in range(horizon):
        yhat = model.predict(seq.reshape(1, SEQ_LEN, n_feat), verbose=0)[0]
        # yhat is expected shape (n_features,)
        preds_scaled.append(yhat)
        seq = np.vstack([seq[1:], yhat])
    preds_scaled = np.array(preds_scaled)
    preds = scaler.inverse_transform(preds_scaled)
    return preds


# ------------------ ROUTES ------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "python": sys.version,
        "seq_len": SEQ_LEN,
        "features": PRODUCT_COLS,
        "model_path": MODEL_PATH,
        "scaler_path": SCALER_PATH,
    })


@app.route("/predict-csv", methods=["POST"])
def predict_csv():
    if "file" not in request.files:
        return jsonify({"error": "Upload a CSV file in 'file' field (form-data)."}), 400

    try:
        days = int(request.form.get("days", 7))
        horizon = days * 24  # convert days -> hours
        category = request.form.get("category")

        df = _read_csv_from_request(request.files["file"])
        df = _prep_dataframe(df)

        if len(df) < SEQ_LEN:
            return jsonify({
                "error": f"Not enough history. Need at least {SEQ_LEN} rows, got {len(df)}"
            }), 400
    #     required_len = 168
    #     if len(df) < required_len:
    # # Repeat last row to pad
    #         last_row = df.iloc[-1:]
    #         n_repeat = required_len - len(df)
    #         df = pd.concat([df, pd.concat([last_row]*n_repeat, ignore_index=True)], ignore_index=True)

        # Scale and prepare last sequence
        scaled = scaler.transform(df[PRODUCT_COLS].values)
        last_seq_scaled = scaled[-SEQ_LEN:]

        # Forecast horizon hours
        preds = _multi_step_forecast(last_seq_scaled, horizon)  # (horizon, n_feat)

        # Forecast time index
        start_ts = df[DATE_COL].max()
        future_index = pd.date_range(start=start_ts, periods=horizon+1, freq="H")[1:]

        pred_df = pd.DataFrame(preds, columns=PRODUCT_COLS, index=future_index)
        pred_df["total"] = pred_df[PRODUCT_COLS].sum(axis=1)

        # Pick category or total
        if category:
            if category not in PRODUCT_COLS and category != "total":
                return jsonify({"error": f"Unknown category '{category}'. Use one of: {PRODUCT_COLS + ['total']}"}), 400
            hist_series = df[[DATE_COL, category]].rename(columns={DATE_COL: "date", category: "value"})
            forecast_series = pred_df[[category]].reset_index().rename(columns={"index": "date", category: "value"})
        else:
            hist_series = df[[DATE_COL, "total"]].rename(columns={DATE_COL: "date", "total": "value"})
            forecast_series = pred_df[["total"]].reset_index().rename(columns={"index": "date", "total": "value"})

        # Aggregate forecast daily
        daily = pred_df.resample("D").sum()
        daily["total"] = daily[PRODUCT_COLS].sum(axis=1)
        if category:
            daily_out = daily[[category]].reset_index().rename(columns={"index": "date", category: "value"})
        else:
            daily_out = daily.reset_index().rename(columns={"index": "date"})
        
        actual = df[PRODUCT_COLS].values[-len(preds):, :]
        predicted = preds[:len(actual), :]

        mae = float(mean_absolute_error(actual, predicted))
        rmse = float(np.sqrt(mean_squared_error(actual, predicted)))
        mask = actual != 0
        if np.any(mask):
            mape = float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)
        else:
            mape = None 

        return jsonify({
            "meta": {
                "seq_len": SEQ_LEN,
                "num_features": len(PRODUCT_COLS),
                "features": PRODUCT_COLS,
                "days": days,
                "hours": horizon,
                "forecast_start": future_index[0].isoformat(),
                "forecast_end": future_index[-1].isoformat(),
                "category": category or "total"
            },
            "historical": {
                "dates": hist_series["date"].astype(str).tolist(),
                "values": hist_series["value"].astype(float).tolist()
            },
            "forecast": {
                "dates": forecast_series["date"].astype(str).tolist(),
                "values": forecast_series["value"].astype(float).tolist()
            },
            "forecast_daily": daily_out.to_dict(orient="records"),
            "metrics": {
                "mae": mae,
                "rmse": rmse,
                "mape": mape  
            }
        })

    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500

# Backward-compatible JSON endpoint (optional)
@app.route("/predict", methods=["POST"])
def predict_json():
    """JSON endpoint in case you want to post an already-parsed CSV as records.
    Body (application/json):
      {
        "records": [ {"datum": "1/2/2014 8:00", "M01AB": 0, ...}, ... ],
        "days": 7,
        "category": "M01AE" | "total" | null
      }
    """
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 415

    payload = request.get_json(silent=True) or {}
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return jsonify({"error": "Provide non-empty 'records' array."}), 400

    # Convert to DataFrame and reuse the CSV path
    df = pd.DataFrame(records)
    # Create a dummy in-memory CSV-like object to reuse prep
    csv_buf = io.StringIO()
    df.to_csv(csv_buf, index=False)
    csv_buf.seek(0)

    # Build a fake FileStorage-like object
    class _FS:
        def __init__(self, buf):
            self.stream = io.BytesIO(buf.getvalue().encode("utf-8"))
        def read(self, *a, **k):
            return self.stream.read(*a, **k)

    request.files = {"file": _FS(csv_buf)}
    request.form = request.form.copy()  # make mutable
    if "days" in payload:
        request.form = request.form.copy()
        request.form["days"] = str(payload.get("days"))
    if "category" in payload:
        request.form["category"] = str(payload.get("category"))

    return predict_csv()


if __name__ == "__main__":
    print(f"Starting ML service on port {PORT}...")
    print(f"Model: {MODEL_PATH}")
    print(f"Scaler: {SCALER_PATH}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
