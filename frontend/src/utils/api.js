import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';
const ML_BASE_URL = 'http://localhost:8000';

// Create axios instances with base URLs
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

const mlClient = axios.create({
  baseURL: ML_BASE_URL,
  timeout: 60000,
});

// Add request interceptors for logging
apiClient.interceptors.request.use((config) => {
  console.log('API Request:', config.method.toUpperCase(), config.url);
  return config;
});

mlClient.interceptors.request.use((config) => {
  console.log('ML Request:', config.method.toUpperCase(), config.url);
  return config;
});

// Add response interceptors for error handling
const handleApiError = (error) => {
  console.error('API Error:', error.response?.data || error.message);
  return Promise.reject(error);
};

apiClient.interceptors.response.use(
  (response) => response,
  handleApiError
);

mlClient.interceptors.response.use(
  (response) => response,
  handleApiError
);

// API functions
export const api = {
  // Dashboard
  getDashboard: () => apiClient.get('/dashboard'),
  
  // Data upload
  uploadData: (formData) => apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  // Analytics
  getAnalytics: (params) => apiClient.get('/analytics', { params }),
  
  // Forecasting
  generateForecast: (data) => apiClient.post('/forecast', data),
};

export const mlApi = {
  // ML predictions
  predict: (data) => mlClient.post('/predict', data),
  
  // Data analysis
  analyzeData: (data) => mlClient.post('/data-analysis', data),
  
  // Health check
  healthCheck: () => mlClient.get('/health'),
};

export default api;
