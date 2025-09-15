import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import '../styles/Analytics.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const Analytics = () => {
  const [analyticsData, setAnalyticsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    drugCategory: '',
    timeframe: 'monthly',
    startDate: '',
    endDate: ''
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

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await axios.get(`http://localhost:5000/api/analytics?${params}`);
      // setAnalyticsData(response.data);
      setAnalyticsData(response.data.analytics || []);
    } catch (error) {
      console.error('Analytics error:', error);
      alert('Failed to fetch analytics data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data based on whether a specific drug is selected
  const prepareChartData = () => {
    if (!analyticsData.length) return { bar: null, doughnut: null };

    if (filters.drugCategory) {
      // Single drug category analysis
      const barData = {
        labels: analyticsData.map(item => `${item._id.month}/${item._id.year}`),
        datasets: [
          {
            label: `${filters.drugCategory} Sales`,
            data: analyticsData.map(item => item[`${filters.drugCategory}_total`] || 0),
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      };

      return { bar: barData, doughnut: null };
    } else {
      // All drug categories comparison
      const barData = {
        labels: analyticsData.map(item => `${item._id.month}/${item._id.year}`),
        datasets: drugCategories.map((drug, index) => ({
          label: drug.code,
          data: analyticsData.map(item => item[`${drug.code}_total`] || 0),
          backgroundColor: `hsla(${index * 45}, 70%, 60%, 0.6)`,
          borderColor: `hsla(${index * 45}, 70%, 60%, 1)`,
          borderWidth: 1,
        }))
      };

      // Aggregate totals for doughnut chart
      const totals = drugCategories.reduce((acc, drug) => {
        acc[drug.code] = analyticsData.reduce((sum, item) => 
          sum + (item[`${drug.code}_total`] || 0), 0);
        return acc;
      }, {});

      const doughnutData = {
        labels: drugCategories.map(drug => drug.code),
        datasets: [{
          data: Object.values(totals),
          backgroundColor: drugCategories.map((_, index) => 
            `hsla(${index * 45}, 70%, 60%, 0.8)`),
          borderWidth: 1,
        }],
      };

      return { bar: barData, doughnut: doughnutData };
    }
  };

  const { bar: barChartData, doughnut: doughnutChartData } = prepareChartData();

  return (
    <div className="analytics">
      <div className="analytics-header">
        <h1>📋 Sales Analytics</h1>
        <p>Detailed analysis and insights from your pharmaceutical sales data</p>
      </div>

      <div className="analytics-filters">
        <h3>🔍 Filters</h3>
        <div className="filter-row">
          <div className="filter-group">
            <label htmlFor="analytics-drugCategory">Drug Category:</label>
            <select
              id="analytics-drugCategory"
              name="drugCategory"
              value={filters.drugCategory}
              onChange={handleFilterChange}
            >
              <option value="">All Drug Categories</option>
              {drugCategories.map((drug) => (
                <option key={drug.code} value={drug.code}>
                  {drug.code} - {drug.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="analytics-timeframe">Timeframe:</label>
            <select
              id="analytics-timeframe"
              name="timeframe"
              value={filters.timeframe}
              onChange={handleFilterChange}
            >
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="start-date">Start Date:</label>
            <input
              id="start-date"
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="end-date">End Date:</label>
            <input
              id="end-date"
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
        </div>

        <button onClick={fetchAnalytics} disabled={loading} className="analyze-btn">
          {loading ? (
            <>
              <span className="spinner"></span>
              Analyzing...
            </>
          ) : (
            <>
              📊 Run Analysis
            </>
          )}
        </button>
      </div>

      {analyticsData.length > 0 && (
        <div className="analytics-results">
          <div className="charts-grid">
            {barChartData && (
              <div className="chart-container">
                <h3>📊 Sales Trends Over Time</h3>
                <div style={{ height: '400px' }}>
                  <Bar
                    data={barChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        title: {
                          display: true,
                          text: 'Sales Analysis by Time Period'
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return value.toFixed(1);
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {doughnutChartData && (
              <div className="chart-container">
                <h3>🥧 Distribution by Drug Category</h3>
                <div style={{ height: '400px' }}>
                  <Doughnut
                    data={doughnutChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'right',
                        },
                        title: {
                          display: true,
                          text: 'Sales Distribution by Drug Category'
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="data-table-container">
            <h3>📋 Detailed Analytics</h3>
            <div className="table-wrapper">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    {filters.drugCategory ? (
                      <th>{filters.drugCategory} Sales</th>
                    ) : (
                      drugCategories.map(drug => (
                        <th key={drug.code}>{drug.code}</th>
                      ))
                    )}
                    <th>Data Points</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.map((item, index) => (
                    <tr key={index}>
                      <td>
                        {item._id.day ? `${item._id.day}/` : ''}
                        {item._id.month}/{item._id.year}
                        {item._id.hour !== undefined ? ` ${item._id.hour}:00` : ''}
                      </td>
                      {filters.drugCategory ? (
                        <td className="currency">
                          {(item[`${filters.drugCategory}_total`] || 0).toFixed(2)}
                        </td>
                      ) : (
                        drugCategories.map(drug => (
                          <td key={drug.code} className="currency">
                            {(item[`${drug.code}_total`] || 0).toFixed(2)}
                          </td>
                        ))
                      )}
                      <td>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
