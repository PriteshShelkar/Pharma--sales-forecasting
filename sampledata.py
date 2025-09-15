import requests
import pandas as pd

# Sample row (one month’s sales across categories)
sample = {
    "datum": "2014-01-31T00:00:00.000+00:00",
    "M01AB": 127.69,
    "M01AE": 99.09,
    "N02BA": 152.1,
    "N02BE": 878.03,
    "N05B": 354,
    "N05C": 50,
    "R03": 112,
    "R06": 48.2,
}

# Step 1: Aggregate drug categories into a single "sales" value
sales_total = sum([
    sample["M01AB"], sample["M01AE"], sample["N02BA"],
    sample["N02BE"], sample["N05B"], sample["N05C"],
    sample["R03"], sample["R06"]
])

# Step 2: Convert into expected format
historical_data = [
    {"date": "2014-01-31", "sales": sales_total},
    {"date": "2014-02-28", "sales": sales_total * 1.05},  # mock next month
    {"date": "2014-03-31", "sales": sales_total * 0.95},  # mock next month
]

# Step 3: Call API
url = "http://127.0.0.1:7000/predict"
payload = {
    "historical_data": historical_data,
    "forecast_period": 6,
    "seasonality": True
}

response = requests.post(url, json=payload)

print("Status:", response.status_code)
print("Response:", response.json())
