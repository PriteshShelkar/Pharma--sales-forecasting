import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import csv
from typing import Dict, List, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')

class DataProcessor:
    """
    Comprehensive data processing utilities for pharmaceutical sales data
    """
    
    def __init__(self):
        self.required_columns = ['date', 'sales', 'product', 'region']
        self.optional_columns = ['volume', 'price', 'units', 'revenue']
        
    def validate_data_format(self, data: List[Dict]) -> Tuple[bool, List[str]]:
        """
        Validate input data format and return validation results
        
        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []
        
        if not data:
            errors.append("Data is empty")
            return False, errors
        
        if not isinstance(data, list):
            errors.append("Data must be a list of dictionaries")
            return False, errors
        
        # Check first few records for structure
        sample_size = min(5, len(data))
        for i, record in enumerate(data[:sample_size]):
            if not isinstance(record, dict):
                errors.append(f"Record {i} is not a dictionary")
                continue
                
            # Check required columns
            for col in self.required_columns:
                if col not in record:
                    errors.append(f"Record {i} missing required column: {col}")
                    
            # Validate date format
            if 'date' in record:
                try:
                    pd.to_datetime(record['date'])
                except:
                    errors.append(f"Record {i} has invalid date format: {record['date']}")
                    
            # Validate numeric fields
            numeric_fields = ['sales', 'volume', 'price', 'units', 'revenue']
            for field in numeric_fields:
                if field in record:
                    try:
                        float(record[field])
                    except (ValueError, TypeError):
                        errors.append(f"Record {i} has non-numeric {field}: {record[field]}")
        
        return len(errors) == 0, errors
    
    def clean_data(self, data: List[Dict]) -> Tuple[List[Dict], List[str]]:
        """
        Clean and standardize the input data
        
        Returns:
            Tuple of (cleaned_data, warning_messages)
        """
        cleaned_data = []
        warnings_list = []
        
        for i, record in enumerate(data):
            cleaned_record = {}
            
            try:
                # Clean date
                if 'date' in record:
                    try:
                        cleaned_record['date'] = pd.to_datetime(record['date']).strftime('%Y-%m-%d')
                    except:
                        warnings_list.append(f"Invalid date in record {i}, using current date")
                        cleaned_record['date'] = datetime.now().strftime('%Y-%m-%d')
                
                # Clean numeric fields
                numeric_fields = ['sales', 'volume', 'price', 'units', 'revenue']
                for field in numeric_fields:
                    if field in record:
                        try:
                            value = float(record[field])
                            # Replace negative values with 0
                            cleaned_record[field] = max(0, value)
                            if value < 0:
                                warnings_list.append(f"Negative {field} in record {i}, set to 0")
                        except (ValueError, TypeError):
                            warnings_list.append(f"Invalid {field} in record {i}, set to 0")
                            cleaned_record[field] = 0.0
                
                # Clean string fields
                string_fields = ['product', 'region']
                for field in string_fields:
                    if field in record:
                        cleaned_record[field] = str(record[field]).strip().lower()
                
                # If sales is missing but revenue and volume exist, calculate it
                if 'sales' not in cleaned_record and 'revenue' in cleaned_record:
                    cleaned_record['sales'] = cleaned_record['revenue']
                
                # Ensure required fields exist
                for field in self.required_columns:
                    if field not in cleaned_record:
                        if field == 'sales':
                            cleaned_record[field] = 0.0
                        else:
                            cleaned_record[field] = 'unknown'
                
                cleaned_data.append(cleaned_record)
                
            except Exception as e:
                warnings_list.append(f"Error processing record {i}: {str(e)}")
        
        return cleaned_data, warnings_list
    
    def aggregate_data(self, data: List[Dict], 
                      groupby_cols: List[str] = ['date', 'product', 'region'],
                      agg_method: str = 'sum') -> List[Dict]:
        """
        Aggregate data by specified columns
        """
        try:
            df = pd.DataFrame(data)
            
            if df.empty:
                return []
            
            # Ensure groupby columns exist
            existing_groupby = [col for col in groupby_cols if col in df.columns]
            if not existing_groupby:
                return data
            
            # Define aggregation methods
            agg_dict = {}
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            
            for col in numeric_cols:
                if col not in existing_groupby:
                    if agg_method == 'sum':
                        agg_dict[col] = 'sum'
                    elif agg_method == 'mean':
                        agg_dict[col] = 'mean'
                    elif agg_method == 'max':
                        agg_dict[col] = 'max'
                    else:
                        agg_dict[col] = 'sum'  # default
            
            if not agg_dict:
                return data
            
            # Aggregate
            aggregated_df = df.groupby(existing_groupby).agg(agg_dict).reset_index()
            
            return aggregated_df.to_dict('records')
            
        except Exception as e:
            print(f"Aggregation error: {str(e)}")
            return data
    
    def detect_outliers(self, data: List[Dict], 
                       column: str = 'sales', 
                       method: str = 'iqr') -> Tuple[List[int], Dict]:
        """
        Detect outliers in the data
        
        Returns:
            Tuple of (outlier_indices, outlier_info)
        """
        try:
            df = pd.DataFrame(data)
            
            if column not in df.columns:
                return [], {}
            
            values = df[column].values
            outlier_indices = []
            outlier_info = {}
            
            if method == 'iqr':
                Q1 = np.percentile(values, 25)
                Q3 = np.percentile(values, 75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                
                outlier_indices = [i for i, val in enumerate(values) 
                                 if val < lower_bound or val > upper_bound]
                
                outlier_info = {
                    'method': 'IQR',
                    'lower_bound': float(lower_bound),
                    'upper_bound': float(upper_bound),
                    'Q1': float(Q1),
                    'Q3': float(Q3),
                    'outlier_count': len(outlier_indices)
                }
                
            elif method == 'zscore':
                mean_val = np.mean(values)
                std_val = np.std(values)
                threshold = 3
                
                z_scores = np.abs((values - mean_val) / (std_val + 1e-8))
                outlier_indices = [i for i, z in enumerate(z_scores) if z > threshold]
                
                outlier_info = {
                    'method': 'Z-Score',
                    'threshold': threshold,
                    'mean': float(mean_val),
                    'std': float(std_val),
                    'outlier_count': len(outlier_indices)
                }
            
            return outlier_indices, outlier_info
            
        except Exception as e:
            print(f"Outlier detection error: {str(e)}")
            return [], {}
    
    def handle_missing_data(self, data: List[Dict], 
                           method: str = 'interpolate') -> List[Dict]:
        """
        Handle missing data in the dataset
        """
        try:
            df = pd.DataFrame(data)
            
            if df.empty:
                return data
            
            # Sort by date if available
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
                df = df.sort_values('date')
            
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            
            for col in numeric_cols:
                if method == 'interpolate':
                    df[col] = df[col].interpolate(method='linear')
                elif method == 'forward_fill':
                    df[col] = df[col].fillna(method='ffill')
                elif method == 'backward_fill':
                    df[col] = df[col].fillna(method='bfill')
                elif method == 'mean':
                    df[col] = df[col].fillna(df[col].mean())
                elif method == 'median':
                    df[col] = df[col].fillna(df[col].median())
                
                # Fill any remaining NaN with 0
                df[col] = df[col].fillna(0)
            
            # Handle string columns
            string_cols = df.select_dtypes(include=['object']).columns
            for col in string_cols:
                if col != 'date':
                    df[col] = df[col].fillna('unknown')
            
            # Convert date back to string
            if 'date' in df.columns:
                df['date'] = df['date'].dt.strftime('%Y-%m-%d')
            
            return df.to_dict('records')
            
        except Exception as e:
            print(f"Missing data handling error: {str(e)}")
            return data
    
    def resample_data(self, data: List[Dict], 
                     frequency: str = 'M',
                     agg_method: str = 'sum') -> List[Dict]:
        """
        Resample time series data to specified frequency
        
        Args:
            frequency: 'D' (daily), 'W' (weekly), 'M' (monthly), 'Q' (quarterly), 'Y' (yearly)
        """
        try:
            df = pd.DataFrame(data)
            
            if df.empty or 'date' not in df.columns:
                return data
            
            df['date'] = pd.to_datetime(df['date'])
            df = df.set_index('date')
            
            # Define aggregation dictionary
            agg_dict = {}
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            string_cols = df.select_dtypes(include=['object']).columns
            
            for col in numeric_cols:
                if agg_method == 'sum':
                    agg_dict[col] = 'sum'
                elif agg_method == 'mean':
                    agg_dict[col] = 'mean'
                else:
                    agg_dict[col] = 'sum'
            
            # For string columns, take the first value
            for col in string_cols:
                agg_dict[col] = 'first'
            
            # Resample
            resampled_df = df.resample(frequency).agg(agg_dict)
            resampled_df = resampled_df.dropna()
            
            # Reset index and convert date back to string
            resampled_df = resampled_df.reset_index()
            resampled_df['date'] = resampled_df['date'].dt.strftime('%Y-%m-%d')
            
            return resampled_df.to_dict('records')
            
        except Exception as e:
            print(f"Resampling error: {str(e)}")
            return data
    
    def calculate_statistics(self, data: List[Dict], 
                           column: str = 'sales') -> Dict:
        """
        Calculate descriptive statistics for a column
        """
        try:
            df = pd.DataFrame(data)
            
            if df.empty or column not in df.columns:
                return {}
            
            values = df[column].values
            
            stats = {
                'count': len(values),
                'mean': float(np.mean(values)),
                'median': float(np.median(values)),
                'std': float(np.std(values)),
                'min': float(np.min(values)),
                'max': float(np.max(values)),
                'q25': float(np.percentile(values, 25)),
                'q75': float(np.percentile(values, 75)),
                'skewness': float(pd.Series(values).skew()),
                'kurtosis': float(pd.Series(values).kurtosis())
            }
            
            # Add growth rate if data is sorted by date
            if 'date' in df.columns and len(df) > 1:
                df_sorted = df.sort_values('date')
                first_value = df_sorted[column].iloc[0]
                last_value = df_sorted[column].iloc[-1]
                
                if first_value != 0:
                    growth_rate = ((last_value - first_value) / first_value) * 100
                    stats['growth_rate'] = float(growth_rate)
                else:
                    stats['growth_rate'] = 0.0
            
            return stats
            
        except Exception as e:
            print(f"Statistics calculation error: {str(e)}")
            return {}
    
    def export_data(self, data: List[Dict], 
                   filepath: str, 
                   format: str = 'csv') -> bool:
        """
        Export data to file
        """
        try:
            if format.lower() == 'csv':
                df = pd.DataFrame(data)
                df.to_csv(filepath, index=False)
            elif format.lower() == 'json':
                with open(filepath, 'w') as f:
                    json.dump(data, f, indent=2)
            else:
                raise ValueError(f"Unsupported format: {format}")
            
            return True
            
        except Exception as e:
            print(f"Export error: {str(e)}")
            return False
    
    def import_data(self, filepath: str, 
                   format: str = 'csv') -> Tuple[List[Dict], List[str]]:
        """
        Import data from file
        """
        try:
            data = []
            errors = []
            
            if format.lower() == 'csv':
                df = pd.read_csv(filepath)
                data = df.to_dict('records')
            elif format.lower() == 'json':
                with open(filepath, 'r') as f:
                    data = json.load(f)
            else:
                errors.append(f"Unsupported format: {format}")
                return [], errors
            
            # Validate imported data
            is_valid, validation_errors = self.validate_data_format(data)
            if not is_valid:
                errors.extend(validation_errors)
            
            return data, errors
            
        except Exception as e:
            return [], [f"Import error: {str(e)}"]
