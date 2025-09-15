import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import '../styles/Dashboard.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Dashboard = () => {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({});
  const [drugCategories, setDrugCategories] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // const fetchDashboardData = async () => {
  //   try {
  //     setLoading(true);
  //     setError(null);
      
  //     console.log('📊 Fetching dashboard data...');
  //     // const response = await axios.get('http://localhost:5000/api/dashboard');
  //     const response = await axios.get(`http://localhost:5000/api/data/${filename}`);

      
  //     console.log('✅ Dashboard data received:', response.data);
  //     setSalesData(response.data.salesData || []);
  //     setKpis(response.data.kpis || {});
  //     setDrugCategories(response.data.drugCategories || []);
      
  //   } catch (error) {
  //     console.error('❌ Error fetching dashboard data:', error);
  //     const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch dashboard data';
  //     setError(`Dashboard Error: ${errorMessage}`);
      
  //     // Set empty defaults to prevent crashes
  //     setSalesData([]);
  //     setKpis({
  //       totalSales: 0,
  //       growthRate: 0,
  //       topDrug: 'No data',
  //       averageDailySales: 0
  //     });
  //     setDrugCategories([]);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

    const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // ✅ Get stored filename from localStorage
      const filename = localStorage.getItem("uploadedFilename");
      if (!filename) {
        throw new Error("No uploaded file found. Please upload data first.");
      }

      console.log("📊 Fetching dashboard data for file:", filename);

      // ✅ Hit backend endpoint that parses file by filename
      const response = await axios.get(`http://localhost:5000/api/dashboard?filename=${filename}`);

      console.log("✅ Dashboard data received:", response.data);
      setSalesData(response.data.salesData || []);
      setKpis(response.data.kpis || {});
      setDrugCategories(response.data.drugCategories || []);
    } catch (error) {
      console.error("❌ Error fetching dashboard data:", error);
      const errorMessage =
        error.response?.data?.error || error.message || "Failed to fetch dashboard data";
      setError(`Dashboard Error: ${errorMessage}`);

      setSalesData([]);
      setKpis({
        totalSales: 0,
        growthRate: 0,
        topDrug: "No data",
        averageDailySales: 0,
      });
      setDrugCategories([]);
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Memoized chart data with comprehensive error handling
  const chartData = useMemo(() => {
    console.log('📈 Processing chart data...', { salesDataLength: salesData.length });
    
    // Safety check for empty or invalid data
    if (!salesData || salesData.length === 0) {
      console.log('⚠️ No sales data available for chart');
      return {
        labels: ['No Data'],
        datasets: [{
          label: 'No Data Available',
          data: [0],
          borderColor: 'rgb(156, 163, 175)',
          backgroundColor: 'rgba(156, 163, 175, 0.1)',
        }]
      };
    }

    try {
      // FIXED: Filter and sort data safely
      const validData = salesData
        .filter(item => {
          // Validate that item has required properties
          if (!item || !item.date) return false;
          
          // Validate date
          const date = new Date(item.date);
          if (isNaN(date.getTime())) return false;
          
          return true;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date)) // FIXED: Chronological order
        .slice(-50); // Show last 50 data points to avoid clutter

      console.log('📊 Valid data points for chart:', validData.length);

      if (validData.length === 0) {
        return {
          labels: ['Invalid Data'],
          datasets: [{
            label: 'Invalid Data Format',
            data: [0],
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
          }]
        };
      }

      return {
        labels: validData.map(item => {
          try {
            return new Date(item.date).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: validData.length > 30 ? undefined : '2-digit' // Show year only for small datasets
            });
          } catch (dateError) {
            console.warn('⚠️ Date formatting error:', dateError);
            return 'Invalid';
          }
        }),
        datasets: [
          {
            label: '📊 Total Daily Sales',
            data: validData.map(item => parseFloat(item.total) || 0),
            borderColor: 'rgb(99, 102, 241)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgb(99, 102, 241)',
            pointBorderColor: 'white',
            pointBorderWidth: 2,
          },
          {
            label: '💊 M01AB (Anti-inflammatory)',
            data: validData.map(item => parseFloat(item.M01AB) || 0),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: 'rgb(239, 68, 68)',
          },
          {
            label: '🩹 N02BE (Pain Relief)',
            data: validData.map(item => parseFloat(item.N02BE) || 0),
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: 'rgb(16, 185, 129)',
          },
          {
            label: '😴 N05B (Anxiolytics)',
            data: validData.map(item => parseFloat(item.N05B) || 0),
            borderColor: 'rgb(245, 158, 11)',
            backgroundColor: 'rgba(245, 158, 11, 0.05)',
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: 'rgb(245, 158, 11)',
          },
        ],
      };
    } catch (chartError) {
      console.error('❌ Chart data processing error:', chartError);
      return {
        labels: ['Error'],
        datasets: [{
          label: 'Chart Error',
          data: [0],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
        }]
      };
    }
  }, [salesData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: 'top',
        labels: {
          padding: 20,
          font: {
            size: 14,
            weight: '600'
          },
          usePointStyle: true,
          pointStyle: 'circle',
        }
      },
      title: { 
        display: true, 
        text: '📈 Pharmaceutical Sales Trends (Timeline →)',
        font: {
          size: 18,
          weight: 'bold'
        },
        padding: 20,
        color: '#1f2937'
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.9)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(99, 102, 241, 0.8)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: function(context) {
            return `📅 ${context[0].label}`;
          },
          label: function(context) {
            const value = parseFloat(context.parsed.y).toFixed(2);
            return `${context.dataset.label}: ${value}`;
          },
          footer: function(tooltipItems) {
            const total = tooltipItems.reduce((sum, item) => {
              return sum + parseFloat(item.parsed.y);
            }, 0);
            return `Total: ${total.toFixed(2)}`;
          }
        }
      }
    },
    scales: { 
      y: { 
        beginAtZero: true,
        grid: {
          color: 'rgba(0,0,0,0.05)',
          drawBorder: false,
        },
        ticks: {
          font: {
            size: 12
          },
          color: '#6b7280',
          callback: function(value) {
            return value.toFixed(1);
          }
        },
        title: {
          display: true,
          text: 'Sales Volume',
          font: {
            size: 14,
            weight: 'bold'
          },
          color: '#374151'
        }
      },
      x: {
        grid: {
          color: 'rgba(0,0,0,0.05)',
          drawBorder: false,
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6b7280',
          maxTicksLimit: 20, // Limit number of date labels
          maxRotation: 45,
          minRotation: 0,
        },
        title: {
          display: true,
          text: 'Timeline (Chronological Order) →',
          font: {
            size: 14,
            weight: 'bold'
          },
          color: '#374151'
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    elements: {
      point: {
        hoverRadius: 8,
      }
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading pharmaceutical sales dashboard..." />;
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-container">
          <h2>⚠️ Dashboard Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={fetchDashboardData} className="retry-btn">
              🔄 Retry Loading
            </button>
            <p className="error-hint">
              💡 Make sure your backend is running and you have uploaded some data
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>📊 Pharmaceutical Sales Dashboard</h1>
        <div className="header-actions">
          <button onClick={fetchDashboardData} className="refresh-btn">
            🔄 Refresh Data
          </button>
          <div className="data-info">
            <span className="data-count">
              📋 {salesData.length} records loaded
            </span>
          </div>
        </div>
      </div>
      
      <div className="kpi-cards">
        <div className="kpi-card revenue">
          <div className="kpi-icon">💊</div>
          <div className="kpi-content">
            <h3>Total Sales Volume</h3>
            <p className="kpi-value">
              {typeof kpis.totalSales === 'number' ? kpis.totalSales.toFixed(1) : '0.0'}
            </p>
            <span className="kpi-subtitle">All drug categories</span>
          </div>
        </div>
        
        {/* <div className={`kpi-card growth ${parseFloat(kpis.growthRate) >= 0 ? 'positive' : 'negative'}`}>
          <div className="kpi-icon">
            {parseFloat(kpis.growthRate) >= 0 ? '📈' : '📉'}
          </div>
          <div className="kpi-content">
            <h3>Growth Rate</h3>
            <p className="kpi-value">
              {parseFloat(kpis.growthRate) >= 0 ? '+' : ''}{kpis.growthRate || '0'}%
            </p>
            <span className="kpi-subtitle">Last Two Interval</span>
          </div>
        </div> */}

        <div className={`kpi-card growth ${parseFloat(kpis.growthRate || 0) > 0 ? 'positive' : (parseFloat(kpis.growthRate || 0) < 0 ? 'negative' : 'neutral')}`}>
          <div className="kpi-icon">
            {parseFloat(kpis.growthRate || 0) > 0 ? '📈' : (parseFloat(kpis.growthRate || 0) < 0 ? '📉' : '➖')}
          </div>
          <div className="kpi-content">
            <h3>Growth Rate</h3>
            <p className="kpi-value">
              {(() => {
                const rate = parseFloat(kpis.growthRate || 0);
                if (rate > 0) return `+${rate.toFixed(1)}%`;
                if (rate < 0) return `${rate.toFixed(1)}%`;
                return '0.0%';
              })()}
            </p>
            <span className="kpi-subtitle">Last Two Interval</span>
          </div>
        </div>


        <div className="kpi-card product">
          <div className="kpi-icon">🏆</div>
          <div className="kpi-content">
            <h3>Top Drug Category</h3>
            <p className="kpi-value">{kpis.topDrug || 'N/A'}</p>
            <span className="kpi-subtitle">Highest sales volume</span>
          </div>
        </div>
        
        
       <div className="kpi-card market">
  <div className="kpi-icon">📊</div>
  <div className="kpi-content">
    <h3>{kpis.averageLabel || 'Average Sales'}</h3>
    <p className="kpi-value">
      {typeof kpis.averagePerRecord === 'number' ? kpis.averagePerRecord.toFixed(1) : '0.0'}
    </p>
    <span className="kpi-subtitle">
      {(() => {
        const granularityMap = {
          hourly: 'hour',
          daily: 'day',
          weekly: 'week',
          monthly: 'month',
          unknown: 'record'
        };
        const unit = granularityMap[kpis.dataGranularity] || 'record';
        return `Per ${unit}`; // Shows correct unit
      })()}
      {kpis.dataGranularity !== 'daily' && kpis.averageDailySales != null
        ? ` (${kpis.averageDailySales.toFixed(1)} daily equiv.)`
        : ''}
    </span>
  </div>
</div>


      </div>

      <div className="chart-section">
        <div className="chart-container">
          <div className="chart-header">
            <h3>📈 Sales Trends Analysis</h3>
            <div className="chart-controls">
              <span className="chart-info">
                {salesData.length > 0 ? 'Showing chronological sales data' : 'No data to display'}
              </span>
            </div>
          </div>
          <div className="chart-wrapper" style={{ height: '500px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {drugCategories.length > 0 && (
        <div className="drug-categories-info">
          <h3>📋 Available Drug Categories</h3>
          <div className="categories-grid">
            {drugCategories.map((category) => (
              <div key={category} className="category-card">
                <span className="category-code">{category}</span>
                <span className="category-name">{getDrugName(category)}</span>
                <span className="category-total">
                  {salesData.length > 0 ? 
                    salesData.reduce((sum, item) => sum + (parseFloat(item[category]) || 0), 0).toFixed(1) : 
                    '0.0'
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {salesData.length === 0 && !loading && !error && (
        <div className="no-data-message">
          <div className="no-data-content">
            <h3>📭 No Sales Data Available</h3>
            <p>Upload your pharmaceutical sales data to see analytics and insights.</p>
            <div className="no-data-actions">
              <button 
                onClick={() => window.location.href = '/upload'} 
                className="upload-redirect-btn"
              >
                📁 Upload Data Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to get readable drug names
const getDrugName = (code) => {
  const drugNames = {
    'M01AB': 'Anti-inflammatory (Acetic acid derivatives)',
    'M01AE': 'Anti-inflammatory (Propionic acid derivatives)',
    'N02BA': 'Analgesics (Salicylic acid derivatives)',
    'N02BE': 'Analgesics (Pyrazolones)',
    'N05B': 'Anxiolytics',
    'N05C': 'Hypnotics and sedatives',
    'R03': 'Respiratory system drugs',
    'R06': 'Antihistamines'
  };
  return drugNames[code] || 'Unknown category';
};

export default Dashboard;
