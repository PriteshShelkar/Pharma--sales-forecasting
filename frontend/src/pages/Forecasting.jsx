import React, { useState } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/Forecasting.css';

const Forecasting = () => {
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    drugCategory: '',
    forecastPeriod: '6',
    seasonality: true,
  });

  const drugCategories = [
    { code: 'M01AB', name: 'Anti-inflammatory (Acetic acid derivatives)' },
    { code: 'M01AE', name: 'Anti-inflammatory (Propionic acid derivatives)' },
    { code: 'N02BA', name: 'Analgesics (Salicylic acid derivatives)' },
    { code: 'N02BE', name: 'Analgesics (Pyrazolones)' },
    { code: 'N05B', name: 'Anxiolytics' },
    { code: 'N05C', name: 'Hypnotics and sedatives' },
    { code: 'R03', name: 'Respiratory system drugs' },
    { code: 'R06', name: 'Antihistamines' }
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const generateForecast = async (e) => {
    e.preventDefault();

    const uploadedFilename = localStorage.getItem("uploadedFilename");

    if (!formData.drugCategory || !formData.forecastPeriod) {
      alert('Please select a drug category and forecast period');
      return;
    }

    if (!uploadedFilename) {
      alert("Please upload a CSV file before forecasting");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post("http://localhost:5000/api/forecast", {
        filename: uploadedFilename,
        drugCategory: formData.drugCategory,
        forecastPeriod: parseInt(formData.forecastPeriod),
        seasonality: formData.seasonality,
      });

      console.log("📊 Flask raw response:", response.data);


      setForecastData(response.data);
    } catch (error) {
      console.error("Forecast error:", error);
      const errorMessage = error.response?.data?.error || error.message || "Forecasting failed";
      alert(`Error generating forecast: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };




const chartData = forecastData ? (() => {
  // Show only last N history points
  const MAX_HISTORY_POINTS = 100; // adjust this number
  const histDates = forecastData.historical.dates.slice(-MAX_HISTORY_POINTS);
  const histValues = forecastData.historical.values.slice(-MAX_HISTORY_POINTS);

  const forecastDates = forecastData.forecast.dates;
  const forecastValues = forecastData.forecast.values;

  // Build labels: trimmed history + forecast
  const labels = [...histDates, ...forecastDates].map(
    date => new Date(date).toLocaleDateString()
  );

  return {
    labels,
    datasets: [
      {
        label: "Historical Sales",
        data: histValues,
        borderColor: "rgb(75, 192, 192)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: "Forecasted Sales",
        // only pad with history slice length, not full history
        data: [...Array(histValues.length).fill(null), ...forecastValues],
        borderColor: "rgb(255, 99, 132)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        borderDash: [5, 5],
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };
})() : null;


  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          padding: 20,
          usePointStyle: true,
        }
      },
      title: {
        display: true,
        text: `Sales Forecast: ${formData.drugCategory}`,
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0,0,0,0.1)'
        },
        ticks: {
          callback: function (value) {
            return value.toFixed(1);
          }
        }
      },
      x: {
        grid: {
          color: 'rgba(0,0,0,0.1)'
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <div className="forecasting">
      <div className="forecasting-header">
        <h1>📈Sales Forecasting</h1>
        <p>Generate accurate sales predictions for pharmaceutical products</p>
      </div>

      <div className="forecasting-content">
        <div className="forecast-form-container">
          <form onSubmit={generateForecast} className="forecast-form">
            <h3>📊 Forecast Parameters</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="drugCategory">🏷️ Drug Category:</label>
                <select
                  id="drugCategory"
                  name="drugCategory"
                  value={formData.drugCategory}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Drug Category</option>
                  {drugCategories.map((drug) => (
                    <option key={drug.code} value={drug.code}>
                      {drug.code} - {drug.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="forecastPeriod">📅 Forecast Period ({forecastData?.granularity || "steps"})</label>
                      <input
                        id="forecastPeriod"
                        type="number"
                        name="forecastPeriod"
                        value={formData.forecastPeriod}
                        onChange={handleInputChange}
                        min="1"
                        max="168"
                        required
                      />
                      <small>
                        Predict {formData.forecastPeriod} {forecastData?.granularity || "steps"} into the future
                      </small>

              </div>
            </div>

            <div className="form-row" style={{display:'none'}}>
              <div className="form-group checkbox-group">
                <label htmlFor="seasonality" className="checkbox-label">
                  <input
                    id="seasonality"
                    type="checkbox"
                    name="seasonality"
                    checked={formData.seasonality}
                    onChange={handleInputChange}
                  />
                  <span className="checkmark"></span>
                  🔄 Include Seasonality
                </label>
                <small>Account for seasonal sales patterns</small>
              </div>
            </div>

            <button type="submit" disabled={loading} className="generate-btn">
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Generating Forecast...
                </>
              ) : (
                <>
                  🚀 Generate Forecast
                </>
              )}
            </button>
          </form>
        </div>

        {forecastData && (
          <div className="forecast-results">
            <div className="results-header">
              <h3>📊 Forecast Results</h3>
            </div>

            <div className="forecast-metrics" style={{ display: 'none' }}>
              <h4>🎯 Model Accuracy Metrics</h4>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">MAE</div>
                  <div className="metric-value">{forecastData.metrics.mae.toFixed(2)}</div>
                  <div className="metric-desc">Mean Absolute Error</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">RMSE</div>
                  <div className="metric-value">{forecastData.metrics.rmse.toFixed(2)}</div>
                  <div className="metric-desc">Root Mean Square Error</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">MAPE</div>
                  <div className="metric-value">{forecastData.metrics.mape.toFixed(2)}%</div>
                  <div className="metric-desc">Mean Absolute Percentage Error</div>
                </div>
              </div>
            </div>

            <div className="chart-container">
              <div style={{ height: '500px' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            <div className="forecast-summary">
              <h4>📈 Forecast Summary</h4>
              <div className="summary-stats">
                <div className="summary-item">
                  <span className="summary-label">Historical Average:</span>
                  <span className="summary-value">
                    {(forecastData.historical.values.reduce((a, b) => a + b, 0) / forecastData.historical.values.length).toFixed(2)}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Forecast Average:</span>
                  <span className="summary-value">
                    {(forecastData.forecast.values.reduce((a, b) => a + b, 0) / forecastData.forecast.values.length).toFixed(2)}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Projected Growth:</span>
                  <span className="summary-value">
                    {(((forecastData.forecast.values.reduce((a, b) => a + b, 0) / forecastData.forecast.values.length) /
                      (forecastData.historical.values.reduce((a, b) => a + b, 0) / forecastData.historical.values.length) - 1) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Forecasting;
