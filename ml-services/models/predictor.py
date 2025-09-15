import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib
import os
import warnings
warnings.filterwarnings('ignore')

class PharmaSalesPredictor:
    """
    Advanced pharmaceutical sales predictor with multiple algorithms
    """
    
    def __init__(self, model_type='random_forest'):
        """
        Initialize predictor with specified model type
        
        Args:
            model_type (str): 'random_forest', 'linear_regression', or 'ensemble'
        """
        self.model_type = model_type
        self.models = {}
        self.scalers = {}
        self.is_trained = False
        self.feature_cols = []
        
        # Initialize models
        if model_type == 'random_forest':
            self.models['primary'] = RandomForestRegressor(
                n_estimators=100, 
                max_depth=10, 
                random_state=42,
                n_jobs=-1
            )
        elif model_type == 'linear_regression':
            self.models['primary'] = LinearRegression()
        elif model_type == 'ensemble':
            self.models['rf'] = RandomForestRegressor(
                n_estimators=100, 
                max_depth=10, 
                random_state=42
            )
            self.models['lr'] = LinearRegression()
            
        # Initialize scalers
        self.scalers['primary'] = StandardScaler()
        
    def create_lag_features(self, df, target_col='sales', max_lag=12):
        """Create lag features for time series data"""
        lag_features = {}
        
        # Create different lag periods
        lag_periods = [1, 3, 6, 12]
        for lag in lag_periods:
            if lag <= max_lag and len(df) > lag:
                lag_features[f'{target_col}_lag{lag}'] = df[target_col].shift(lag)
            else:
                # For insufficient data, use mean
                lag_features[f'{target_col}_lag{lag}'] = df[target_col].mean()
                
        return pd.DataFrame(lag_features)
    
    def create_rolling_features(self, df, target_col='sales'):
        """Create rolling window statistical features"""
        rolling_features = {}
        
        # Different window sizes
        windows = [3, 6, 12]
        
        for window in windows:
            actual_window = min(window, len(df))
            if actual_window >= 1:
                rolling_features[f'{target_col}_ma{window}'] = df[target_col].rolling(
                    window=actual_window, min_periods=1
                ).mean()
                
                rolling_features[f'{target_col}_std{window}'] = df[target_col].rolling(
                    window=actual_window, min_periods=1
                ).std().fillna(0)
                
                rolling_features[f'{target_col}_min{window}'] = df[target_col].rolling(
                    window=actual_window, min_periods=1
                ).min()
                
                rolling_features[f'{target_col}_max{window}'] = df[target_col].rolling(
                    window=actual_window, min_periods=1
                ).max()
        
        return pd.DataFrame(rolling_features)
    
    def create_seasonal_features(self, df, date_col='date'):
        """Create seasonal and cyclical features"""
        seasonal_features = {}
        
        # Basic time features
        seasonal_features['year'] = df[date_col].dt.year
        seasonal_features['month'] = df[date_col].dt.month
        seasonal_features['quarter'] = df[date_col].dt.quarter
        seasonal_features['day_of_year'] = df[date_col].dt.dayofyear
        seasonal_features['week_of_year'] = df[date_col].dt.isocalendar().week
        
        # Cyclical encoding for seasonal patterns
        seasonal_features['month_sin'] = np.sin(2 * np.pi * df[date_col].dt.month / 12)
        seasonal_features['month_cos'] = np.cos(2 * np.pi * df[date_col].dt.month / 12)
        
        seasonal_features['quarter_sin'] = np.sin(2 * np.pi * df[date_col].dt.quarter / 4)
        seasonal_features['quarter_cos'] = np.cos(2 * np.pi * df[date_col].dt.quarter / 4)
        
        # Day of year cyclical
        seasonal_features['day_sin'] = np.sin(2 * np.pi * df[date_col].dt.dayofyear / 365.25)
        seasonal_features['day_cos'] = np.cos(2 * np.pi * df[date_col].dt.dayofyear / 365.25)
        
        return pd.DataFrame(seasonal_features)
    
    def create_trend_features(self, df, target_col='sales'):
        """Create trend-based features"""
        trend_features = {}
        
        # Linear trend
        trend_features['trend'] = np.arange(len(df))
        
        # Growth rate features
        if len(df) > 1:
            trend_features[f'{target_col}_diff'] = df[target_col].diff().fillna(0)
            trend_features[f'{target_col}_pct_change'] = df[target_col].pct_change().fillna(0)
        else:
            trend_features[f'{target_col}_diff'] = 0
            trend_features[f'{target_col}_pct_change'] = 0
            
        return pd.DataFrame(trend_features)
    
    def prepare_features(self, data, include_seasonality=True, target_col='sales'):
        """
        Comprehensive feature engineering pipeline
        """
        try:
            df = pd.DataFrame(data)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            
            # Create feature dataframes
            feature_dfs = []
            
            # 1. Seasonal features
            if include_seasonality:
                seasonal_df = self.create_seasonal_features(df)
                feature_dfs.append(seasonal_df)
            
            # 2. Lag features
            lag_df = self.create_lag_features(df, target_col)
            feature_dfs.append(lag_df)
            
            # 3. Rolling features
            rolling_df = self.create_rolling_features(df, target_col)
            feature_dfs.append(rolling_df)
            
            # 4. Trend features
            trend_df = self.create_trend_features(df, target_col)
            feature_dfs.append(trend_df)
            
            # Combine all features
            for feature_df in feature_dfs:
                for col in feature_df.columns:
                    df[col] = feature_df[col]
            
            # Handle infinite and NaN values
            df = df.replace([np.inf, -np.inf], np.nan)
            df = df.fillna(method='bfill').fillna(method='ffill').fillna(0)
            
            return df
            
        except Exception as e:
            print(f"Error in feature preparation: {str(e)}")
            raise e
    
    def train(self, historical_data, include_seasonality=True, target_col='sales'):
        """
        Train the prediction model
        """
        try:
            # Prepare features
            df = self.prepare_features(historical_data, include_seasonality, target_col)
            
            if len(df) < 3:
                raise ValueError("Need at least 3 data points for training")
            
            # Define feature columns (exclude date and target)
            exclude_cols = ['date', target_col]
            feature_cols = [col for col in df.columns if col not in exclude_cols]
            
            X = df[feature_cols].values
            y = df[target_col].values
            
            # Handle any remaining problematic values
            X = np.nan_to_num(X, nan=0.0, posinf=1e6, neginf=-1e6)
            y = np.nan_to_num(y, nan=0.0, posinf=1e6, neginf=-1e6)
            
            # Scale features
            X_scaled = self.scalers['primary'].fit_transform(X)
            
            # Train model(s)
            if self.model_type == 'ensemble':
                # Train multiple models
                for model_name, model in self.models.items():
                    model.fit(X_scaled, y)
            else:
                # Train single model
                self.models['primary'].fit(X_scaled, y)
            
            # Store feature columns and mark as trained
            self.feature_cols = feature_cols
            self.is_trained = True
            
            return df
            
        except Exception as e:
            print(f"Training error: {str(e)}")
            raise e
    
    def predict_single(self, data_point, include_seasonality=True, target_col='sales'):
        """
        Make a single prediction
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        try:
            # Prepare features for single point
            temp_df = self.prepare_features([data_point], include_seasonality, target_col)
            
            if len(temp_df) == 0:
                return data_point.get(target_col, 0)
            
            # Extract features
            X_pred = temp_df[self.feature_cols].iloc[-1:].values
            X_pred = np.nan_to_num(X_pred, nan=0.0, posinf=1e6, neginf=-1e6)
            X_pred_scaled = self.scalers['primary'].transform(X_pred)
            
            # Make prediction
            if self.model_type == 'ensemble':
                # Average predictions from multiple models
                predictions = []
                for model_name, model in self.models.items():
                    pred = model.predict(X_pred_scaled)[0]
                    predictions.append(pred)
                prediction = np.mean(predictions)
            else:
                prediction = self.models['primary'].predict(X_pred_scaled)[0]
            
            return max(0, float(prediction))  # Ensure non-negative
            
        except Exception as e:
            print(f"Single prediction error: {str(e)}")
            # Return a reasonable default
            return float(data_point.get(target_col, 0))
    
    def predict_sequence(self, last_data_point, forecast_periods, include_seasonality=True, target_col='sales'):
        """
        Make sequential predictions for multiple periods
        """
        predictions = []
        current_data = last_data_point.copy()
        
        try:
            for i in range(forecast_periods):
                # Update date
                current_date = pd.to_datetime(current_data['date']) + pd.DateOffset(months=1)
                current_data['date'] = current_date.strftime('%Y-%m-%d')
                
                # Make prediction
                pred = self.predict_single(current_data, include_seasonality, target_col)
                predictions.append(pred)
                
                # Update current data with prediction for next iteration
                current_data[target_col] = pred
                
        except Exception as e:
            print(f"Sequence prediction error: {str(e)}")
            # Fill remaining predictions with trend-based estimates
            if predictions:
                last_pred = predictions[-1]
                growth_rate = 0.02  # 2% default growth
                for j in range(len(predictions), forecast_periods):
                    pred = last_pred * (1 + growth_rate)
                    predictions.append(pred)
                    last_pred = pred
            else:
                # If no predictions made, use base value with slight growth
                base_value = float(last_data_point.get(target_col, 1000))
                for j in range(forecast_periods):
                    pred = base_value * (1 + 0.02 * j)
                    predictions.append(pred)
        
        return predictions
    
    def calculate_metrics(self, y_true, y_pred):
        """
        Calculate model performance metrics
        """
        try:
            mae = float(mean_absolute_error(y_true, y_pred))
            rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
            
            # Avoid division by zero
            y_true_safe = np.where(y_true == 0, 1e-8, y_true)
            mape = float(np.mean(np.abs((y_true - y_pred) / y_true_safe)) * 100)
            
            # Calculate R²
            ss_res = np.sum((y_true - y_pred) ** 2)
            ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
            r2 = float(1 - (ss_res / (ss_tot + 1e-8)))
            
            return {
                'mae': mae,
                'rmse': rmse,
                'mape': mape,
                'r2': r2
            }
        except Exception as e:
            print(f"Metrics calculation error: {str(e)}")
            return {'mae': 0.0, 'rmse': 0.0, 'mape': 0.0, 'r2': 0.0}
    
    def save_model(self, filepath):
        """
        Save trained model to file
        """
        if not self.is_trained:
            raise ValueError("Cannot save untrained model")
        
        model_data = {
            'models': self.models,
            'scalers': self.scalers,
            'feature_cols': self.feature_cols,
            'model_type': self.model_type,
            'is_trained': self.is_trained
        }
        
        joblib.dump(model_data, filepath)
        print(f"Model saved to {filepath}")
    
    def load_model(self, filepath):
        """
        Load trained model from file
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Model file not found: {filepath}")
        
        model_data = joblib.load(filepath)
        
        self.models = model_data['models']
        self.scalers = model_data['scalers']
        self.feature_cols = model_data['feature_cols']
        self.model_type = model_data['model_type']
        self.is_trained = model_data['is_trained']
        
        print(f"Model loaded from {filepath}")
