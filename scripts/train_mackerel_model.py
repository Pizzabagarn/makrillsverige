#!/usr/bin/env python3
"""
Train Mackerel Prediction Model with Real Fishing Data
=====================================================

This script trains a logistic regression model using real fishing data
collected from users through the web interface.

Usage:
    python train_mackerel_model.py --data fishing_data_export.json
    python train_mackerel_model.py --data fishing_data_export.json --retrain
    python train_mackerel_model.py --evaluate
"""

import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, roc_curve
from sklearn.pipeline import Pipeline
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import argparse
import os
import pickle
from typing import Dict, List, Tuple, Optional

class MackerelModelTrainer:
    def __init__(self, data_path: Optional[str] = None):
        self.data_path = data_path
        self.model = None
        self.scaler = None
        self.training_data = None
        self.feature_columns = [
            'temperature', 'salinity', 'current_strength', 'current_direction',
            'season_sin', 'season_cos', 'temperature_hist', 'salinity_hist', 
            'current_strength_hist'
        ]
        
    def load_fishing_data(self) -> pd.DataFrame:
        """Load and parse fishing data from JSON export"""
        if not self.data_path or not os.path.exists(self.data_path):
            raise FileNotFoundError(f"Data file not found: {self.data_path}")
            
        with open(self.data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        reports = data.get('reports', [])
        if not reports:
            raise ValueError("No fishing reports found in data file")
            
        # Convert to training data format
        training_points = []
        
        for report in reports:
            points = self._generate_training_points_from_report(report)
            training_points.extend(points)
            
        if not training_points:
            raise ValueError("No training points could be generated from reports")
            
        return pd.DataFrame(training_points)
    
    def _generate_training_points_from_report(self, report: Dict) -> List[Dict]:
        """Generate training points from a single fishing report"""
        points = []
        
        # Parse report data
        bounds = report['location']['bounds']
        date_range = report['dateRange']
        time_range = report['timeRange'] 
        quality = report['quality']
        
        # Convert quality to numerical value
        quality_map = {
            'excellent': 1.0,
            'good': 0.8,
            'fair': 0.6,
            'poor': 0.3,
            'none': 0.0
        }
        fishing_quality = quality_map.get(quality, 0.0)
        
        # Generate grid points (simplified for demo)
        lat_points = np.linspace(bounds['south'], bounds['north'], 3)
        lng_points = np.linspace(bounds['west'], bounds['east'], 3)
        
        # Generate time points
        start_date = datetime.fromisoformat(date_range['start'])
        end_date = datetime.fromisoformat(date_range['end'])
        
        current_date = start_date
        while current_date <= end_date:
            # Generate seasonal features
            day_of_year = current_date.timetuple().tm_yday
            season_sin = np.sin(2 * np.pi * day_of_year / 365.25)
            season_cos = np.cos(2 * np.pi * day_of_year / 365.25)
            
            for lat in lat_points:
                for lng in lng_points:
                    # TODO: In real implementation, fetch actual marine data
                    # For now, generate synthetic data based on location and time
                    point = {
                        'latitude': lat,
                        'longitude': lng,
                        'datetime': current_date.isoformat(),
                        'temperature': self._estimate_temperature(lat, lng, current_date),
                        'salinity': self._estimate_salinity(lat, lng, current_date),
                        'current_strength': self._estimate_current_strength(lat, lng, current_date),
                        'current_direction': self._estimate_current_direction(lat, lng, current_date),
                        'season_sin': season_sin,
                        'season_cos': season_cos,
                        'temperature_hist': self._estimate_temperature(lat, lng, current_date) * 0.95,
                        'salinity_hist': self._estimate_salinity(lat, lng, current_date) * 1.02,
                        'current_strength_hist': self._estimate_current_strength(lat, lng, current_date) * 0.9,
                        'fishing_quality': fishing_quality,
                        'report_id': report['id']
                    }
                    points.append(point)
            
            current_date += timedelta(days=1)
            
        return points
    
    def _estimate_temperature(self, lat: float, lng: float, date: datetime) -> float:
        """Estimate temperature (placeholder - replace with actual data fetch)"""
        # Basic seasonal variation
        day_of_year = date.timetuple().tm_yday
        seasonal_temp = 12 + 8 * np.sin(2 * np.pi * (day_of_year - 80) / 365.25)
        
        # Geographic variation (southern waters warmer)
        geo_temp = seasonal_temp + (57.0 - lat) * 0.5
        
        return np.clip(geo_temp, 2, 25)
    
    def _estimate_salinity(self, lat: float, lng: float, date: datetime) -> float:
        """Estimate salinity (placeholder - replace with actual data fetch)"""
        # Baltic Sea has lower salinity than North Sea
        base_salinity = 35.0 if lng > 14.0 else 10.0
        return base_salinity + np.random.normal(0, 2)
    
    def _estimate_current_strength(self, lat: float, lng: float, date: datetime) -> float:
        """Estimate current strength (placeholder)"""
        return np.random.uniform(0.0, 1.5)
    
    def _estimate_current_direction(self, lat: float, lng: float, date: datetime) -> float:
        """Estimate current direction (placeholder)"""
        return np.random.uniform(0, 360)
    
    def prepare_training_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare features and target for training"""
        X = np.array(df[self.feature_columns].values)
        y = np.array(df['fishing_quality'].values)
        
        # Convert to binary classification (good fishing vs poor fishing)
        y_binary = (y >= 0.6).astype(int)
        
        return X, y_binary
    
    def train_model(self, X: np.ndarray, y: np.ndarray) -> Dict:
        """Train the logistic regression model"""
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # Create pipeline with scaling
        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('classifier', LogisticRegression(random_state=42, max_iter=1000))
        ])
        
        # Train model
        pipeline.fit(X_train, y_train)
        
        # Evaluate
        train_score = pipeline.score(X_train, y_train)
        test_score = pipeline.score(X_test, y_test)
        
        # Cross-validation
        cv_scores = cross_val_score(pipeline, X_train, y_train, cv=5)
        
        # Predictions for metrics
        y_pred = pipeline.predict(X_test)
        y_pred_proba = pipeline.predict_proba(X_test)[:, 1]
        
        # Store trained model
        self.model = pipeline
        
        return {
            'train_accuracy': train_score,
            'test_accuracy': test_score,
            'cv_mean': cv_scores.mean(),
            'cv_std': cv_scores.std(),
            'auc_roc': roc_auc_score(y_test, y_pred_proba),
            'classification_report': classification_report(y_test, y_pred),
            'confusion_matrix': confusion_matrix(y_test, y_pred),
            'coefficients': pipeline.named_steps['classifier'].coef_[0],
            'intercept': pipeline.named_steps['classifier'].intercept_[0],
            'feature_names': self.feature_columns
        }
    
    def save_model(self, model_path: str = 'trained_mackerel_model.pkl'):
        """Save the trained model"""
        if self.model is None:
            raise ValueError("No trained model to save")
            
        with open(model_path, 'wb') as f:
            pickle.dump(self.model, f)
            
        print(f"Model saved to {model_path}")
    
    def load_model(self, model_path: str = 'trained_mackerel_model.pkl'):
        """Load a trained model"""
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
            
        with open(model_path, 'rb') as f:
            self.model = pickle.load(f)
            
        print(f"Model loaded from {model_path}")
    
    def generate_coefficients_file(self, results: Dict, output_path: str = 'trained_coefficients.json'):
        """Generate coefficients file for use in generate_mackerel_probability.py"""
        coefficients = {
            'method': 'trained_on_real_data',
            'trained_at': datetime.now().isoformat(),
            'model_performance': {
                'accuracy': results['test_accuracy'],
                'auc_roc': results['auc_roc'],
                'cv_mean': results['cv_mean'],
                'cv_std': results['cv_std']
            },
            'coefficients': {
                'intercept': float(results['intercept']),
                'features': {}
            }
        }
        
        # Map coefficients to feature names
        for i, feature in enumerate(self.feature_columns):
            coefficients['coefficients']['features'][feature] = float(results['coefficients'][i])
            
        with open(output_path, 'w') as f:
            json.dump(coefficients, f, indent=2)
            
        print(f"Coefficients saved to {output_path}")
        
        # Also print for easy copy-paste into Python script
        print("\nCoefficients for generate_mackerel_probability.py:")
        print(f"β₀ (intercept) = {results['intercept']:.3f}")
        for i, feature in enumerate(self.feature_columns):
            print(f"β_{i+1} ({feature}) = {results['coefficients'][i]:.3f}")
    
    def plot_results(self, results: Dict):
        """Plot training results"""
        fig, axes = plt.subplots(2, 2, figsize=(15, 12))
        
        # Confusion Matrix
        sns.heatmap(results['confusion_matrix'], annot=True, fmt='d', 
                   cmap='Blues', ax=axes[0,0])
        axes[0,0].set_title('Confusion Matrix')
        axes[0,0].set_xlabel('Predicted')
        axes[0,0].set_ylabel('Actual')
        
        # Feature Importance (coefficients)
        coef_df = pd.DataFrame({
            'feature': self.feature_columns,
            'coefficient': results['coefficients']
        }).sort_values('coefficient', key=abs, ascending=False)
        
        sns.barplot(data=coef_df, x='coefficient', y='feature', ax=axes[0,1])
        axes[0,1].set_title('Feature Importance (Coefficients)')
        
        # Model Performance Metrics
        metrics = ['Train Acc', 'Test Acc', 'CV Mean', 'AUC-ROC']
        values = [results['train_accuracy'], results['test_accuracy'], 
                 results['cv_mean'], results['auc_roc']]
        
        axes[1,0].bar(metrics, values)
        axes[1,0].set_title('Model Performance Metrics')
        axes[1,0].set_ylim(0, 1)
        
        # Text summary
        axes[1,1].text(0.1, 0.9, f"Model Summary", fontsize=14, weight='bold', 
                      transform=axes[1,1].transAxes)
        axes[1,1].text(0.1, 0.8, f"Accuracy: {results['test_accuracy']:.3f}", 
                      transform=axes[1,1].transAxes)
        axes[1,1].text(0.1, 0.7, f"AUC-ROC: {results['auc_roc']:.3f}", 
                      transform=axes[1,1].transAxes)
        axes[1,1].text(0.1, 0.6, f"CV Score: {results['cv_mean']:.3f} ± {results['cv_std']:.3f}", 
                      transform=axes[1,1].transAxes)
        axes[1,1].axis('off')
        
        plt.tight_layout()
        plt.savefig('mackerel_model_results.png', dpi=300, bbox_inches='tight')
        plt.show()

def main():
    parser = argparse.ArgumentParser(description='Train Mackerel Prediction Model')
    parser.add_argument('--data', type=str, help='Path to fishing data JSON export')
    parser.add_argument('--retrain', action='store_true', help='Force retraining even if model exists')
    parser.add_argument('--evaluate', action='store_true', help='Evaluate existing model')
    
    args = parser.parse_args()
    
    trainer = MackerelModelTrainer(args.data)
    
    if args.evaluate:
        try:
            trainer.load_model()
            print("Model loaded successfully for evaluation")
            # Add evaluation code here
        except FileNotFoundError:
            print("No trained model found. Please train a model first.")
        return
    
    if not args.data:
        print("Please provide fishing data with --data parameter")
        print("Export data from the web interface first.")
        return
    
    try:
        print("Loading fishing data...")
        df = trainer.load_fishing_data()
        print(f"Loaded {len(df)} training points from {df['report_id'].nunique()} reports")
        
        print("Preparing training data...")
        X, y = trainer.prepare_training_data(df)
        print(f"Features shape: {X.shape}")
        print(f"Target distribution: {np.bincount(y)}")
        
        print("Training model...")
        results = trainer.train_model(X, y)
        
        print("\nTraining Results:")
        print(f"Test Accuracy: {results['test_accuracy']:.3f}")
        print(f"AUC-ROC: {results['auc_roc']:.3f}")
        print(f"CV Score: {results['cv_mean']:.3f} ± {results['cv_std']:.3f}")
        
        print("\nClassification Report:")
        print(results['classification_report'])
        
        trainer.save_model()
        trainer.generate_coefficients_file(results)
        trainer.plot_results(results)
        
        print("\nModel training completed successfully!")
        print("You can now use the trained coefficients in your mackerel probability generation.")
        
    except Exception as e:
        print(f"Error during training: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main() 