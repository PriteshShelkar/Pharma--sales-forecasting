from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sys
import os
import pandas as pd
import numpy as np
import warnings
from pymongo import MongoClient
from tensorflow.keras.models import load_model
import joblib

current_dir = os.path.abspath(os.path.dirname(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..')) 

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# from models.predictor import PharmaSalesPredictor
# from models.lstm import PharmaSalesLSTMPredictor
from utils.data_processor import DataProcessor

warnings.filterwarnings('ignore')

MONGO_URI = "mongodb://localhost:27017/"
MONGO_DB = "pharma_sales"
MONGO_COLLECTION = "salesdatas"

# FIX: Define model paths before loading
MODEL_PATH = os.path.join(current_dir, "models", "pharma_lstm_model.h5")
SCALER_PATH = os.path.join(current_dir, "models", "scaler.pkl")
    
client = MongoClient(MONGO_URI)
collection = client[MONGO_DB][MONGO_COLLECTION]

# FIX: Load model with Keras 3.x compatibility
lstm_model = load_model(MODEL_PATH, compile=False)
lstm_model.compile(optimizer='adam', loss='mse', metrics=['mae'])

scaler = joblib.load(SCALER_PATH)

def fetch_data_from_mongo(limit=100):
    docs = list(collection.find().sort("datum", 1).limit(limit))
    return [transform_mongo_doc(doc) for doc in docs if "datum" in doc]

# FIX: Get the project root directory (one level up from ml-services)
current_dir = os.path.abspath(os.path.dirname(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))  # Go up one directory
DIST_DIR = os.path.join(project_root, "frontend", "dist")

app = Flask(__name__, static_folder=DIST_DIR, static_url_path="")
CORS(app)

# Initialize ML components
# predictor = PharmaSalesLSTMPredictor(model_type='lstm')
data_processor = DataProcessor()

# ------------------- API ROUTES -------------------

def transform_mongo_doc(doc):
    product_keys = [k for k in doc.keys() if k not in ["_id", "datum", "year", "month", "hour", "weekdayName"]]
    total_sales = sum(float(doc[k]) for k in product_keys if isinstance(doc[k], (int, float)))
    return {
        "date": doc["datum"][:10],  # YYYY-MM-DD
        "sales": total_sales
    }

@app.route('/predict', methods=['POST'])
def predict_sales():
    try:
        if request.is_json:
            data = request.get_json()
        else:
            return jsonify({"error": "Invalid content type, must be JSON"}), 415

        forecast_period = int(data.get("forecast_period", 6))

        # FIX: Default to MongoDB if no historical_data provided
        if data.get("use_mongo", False) or not data.get("historical_data"):
            historical_data = fetch_data_from_mongo(limit=data.get("limit", 100))
        else:
            # Case B: use posted data
            historical_data = data.get("historical_data")
            if historical_data is None and "datum" in data:
                historical_data = [transform_mongo_doc(data)]
            if historical_data is None and isinstance(data, list):
                historical_data = [transform_mongo_doc(doc) for doc in data if "datum" in doc]

        if not historical_data:
            return jsonify({"error": "No valid historical data found"}), 400

        # 👉 Convert to DataFrame
        df = pd.DataFrame(historical_data)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date")

        # FIX: Use the correct features that scaler expects
        expected_features = ['M01AB', 'M01AE', 'N02BA', 'N02BE', 'N05B', 'N05C', 'R03', 'R06']
        
        # Check if MongoDB data has product columns, otherwise use sales
        if all(col in df.columns for col in expected_features):
            product_cols = expected_features
        else:
            # If no product columns, we need to reconstruct them from sales or handle differently
            product_cols = [c for c in df.columns if c not in ["date", "sales"]]
            if not product_cols:
                return jsonify({"error": "No valid product features found for prediction"}), 400

        seq_len = 12  # must match training
        
        # FIX: Handle insufficient data
        if len(df) < seq_len:
            return jsonify({"error": f"Insufficient data. Need at least {seq_len} records, got {len(df)}"}), 400
            
        scaled_data = scaler.transform(df[product_cols].values)
        last_seq = scaled_data[-seq_len:]

        # 👉 Forecast
        predictions = []
        current_seq = last_seq.copy()
        for _ in range(forecast_period):
            pred = lstm_model.predict(current_seq.reshape(1, seq_len, -1), verbose=0)[0]
            predictions.append(float(pred))
            # roll window
            current_seq = np.vstack([current_seq[1:], pred])

        # 👉 Generate future dates
        last_date = df["date"].max()
        future_dates = pd.date_range(start=last_date, periods=forecast_period + 1, freq="M")[1:]

        forecast = [{"date": str(d.date()), "predicted_sales": float(s)} for d, s in zip(future_dates, predictions)]

        return jsonify({"forecast": forecast})

    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500

@app.route('/data-analysis', methods=['POST'])
def analyze_data():
    try:
        data = request.json
        historical_data = data.get('data', [])
        
        # Validate and clean data
        is_valid, validation_errors = data_processor.validate_data_format(historical_data)
        if not is_valid:
            return jsonify({'error': f'Data validation failed: {"; ".join(validation_errors)}'}), 400
        
        cleaned_data, warnings_list = data_processor.clean_data(historical_data)
        
        # Statistics
        stats = data_processor.calculate_statistics(cleaned_data, 'sales')
        
        # Outliers
        outlier_indices, outlier_info = data_processor.detect_outliers(cleaned_data, 'sales', 'iqr')
        
        # Monthly aggregation
        monthly_data = data_processor.resample_data(cleaned_data, frequency='M', agg_method='sum')
        
        response = {
            'statistics': stats,
            'outliers': {
                'indices': outlier_indices,
                'info': outlier_info
            },
            'monthly_aggregation': monthly_data,
            'warnings': warnings_list,
            'data_quality': {
                'total_records': len(cleaned_data),
                'valid_records': len([d for d in cleaned_data if d.get('sales', 0) > 0]),
                'date_range': {
                    'start': min([d['date'] for d in cleaned_data]) if cleaned_data else None,
                    'end': max([d['date'] for d in cleaned_data]) if cleaned_data else None
                }
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Analysis error: {str(e)}")
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'python_version': sys.version,
        'components': {
            'predictor': 'loaded',
            'data_processor': 'loaded'
        }
    })

# ------------------- FRONTEND ROUTES -------------------

# Serve index.html at root
@app.route("/")
def serve_index():
    try:
        return send_from_directory(DIST_DIR, "index.html")
    except Exception as e:
        return f"Error serving index.html: {str(e)}<br>DIST_DIR: {DIST_DIR}<br>Exists: {os.path.exists(DIST_DIR)}"

# Catch-all: serve static files or index.html (for React Router)
@app.route("/<path:path>")
def serve_frontend(path):
    try:
        # First, check if it's a static file (JS, CSS, images, etc.)
        file_path = os.path.join(DIST_DIR, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(DIST_DIR, path)
        
        # If it's not a file, check if it's an API route
        api_routes = ['predict', 'data-analysis', 'health']
        if any(path.startswith(route) for route in api_routes):
            return jsonify({"error": "API endpoint not found"}), 404
        
        # For all other routes (SPA routing), serve index.html
        return send_from_directory(DIST_DIR, "index.html")
        
    except Exception as e:
        print(f"Frontend serving error: {str(e)}")
        return jsonify({"error": f"Frontend serving failed: {str(e)}"}), 500

# Add a debug route to check the setup
@app.route("/debug")
def debug_info():
    return jsonify({
        "current_dir": current_dir,
        "project_root": project_root,
        "dist_dir": DIST_DIR,
        "dist_exists": os.path.exists(DIST_DIR),
        "files_in_dist": os.listdir(DIST_DIR) if os.path.exists(DIST_DIR) else [],
        "index_exists": os.path.exists(os.path.join(DIST_DIR, "index.html")),
        "current_working_dir": os.getcwd(),
    })

# ------------------- MAIN -------------------

if __name__ == '__main__':
    print(f"Starting ML service with Python {sys.version}")
    print(f"Current dir: {current_dir}")
    print(f"Project root: {project_root}")
    print(f"DIST_DIR: {DIST_DIR}")
    print(f"DIST_DIR exists: {os.path.exists(DIST_DIR)}")
    if os.path.exists(DIST_DIR):
        print(f"Files in DIST_DIR: {os.listdir(DIST_DIR)}")
    else:
        print("DIST_DIR does not exist!")
        # Check if frontend folder exists at project root
        frontend_dir = os.path.join(project_root, "frontend")
        if os.path.exists(frontend_dir):
            print(f"Frontend folder exists at: {frontend_dir}")
            print(f"Contents: {os.listdir(frontend_dir)}")
        else:
            print("Frontend folder not found!")
    
    print("Available endpoints:")
    print("  GET / - Frontend application")
    print("  POST /predict - Generate sales forecasts")
    print("  POST /data-analysis - Analyze data quality and statistics")
    print("  GET /health - Health check")
    print("  GET /debug - Debug information")
    app.run(host='0.0.0.0', port=7000, debug=True)
