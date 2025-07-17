#!/usr/bin/env python3
"""
FÖRBÄTTRAD Mackerel Model Trainer - Använder faktiska marina data snapshots
==================================================================================

Denna version läser från marine_data_snapshots.json som innehåller faktiska
marina parametrar som hämtats från area-parameters vid tidpunkten för fiskrapporter.

Usage:
    python train_mackerel_model_real_data.py --snapshots marine_data_snapshots.json
    python train_mackerel_model_real_data.py --evaluate
"""

import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.pipeline import Pipeline
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import argparse
import os
import pickle
from typing import Dict, List, Tuple, Optional

class RealDataMackerelTrainer:
    def __init__(self, snapshots_path: Optional[str] = None):
        # FIX 1: Korrekt default sökväg
        self.snapshots_path = snapshots_path or 'public/data/marine_data_snapshots.json'
        self.model = None
        self.scaler = None
        self.training_data = None
        self.feature_columns = [
            'temperature', 'salinity', 'current_strength', 'current_direction',
            'season_sin', 'season_cos', 'hours_before_report', 'is_report_day'
        ]
        
    def load_snapshots_data(self) -> pd.DataFrame:
        """Ladda och parse marine data snapshots"""
        if not os.path.exists(self.snapshots_path):
            raise FileNotFoundError(f"Snapshots file not found: {self.snapshots_path}")
            
        with open(self.snapshots_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        snapshots = data.get('snapshots', [])
        if not snapshots:
            raise ValueError("No snapshots found in data file")
            
        print(f"📦 Laddade {len(snapshots)} snapshots från {self.snapshots_path}")
        
        # Konvertera till träningsdata
        training_points = []
        
        for snapshot in snapshots:
            points = self._process_snapshot(snapshot)
            training_points.extend(points)
            
        if not training_points:
            raise ValueError("No training points could be generated from snapshots")
            
        return pd.DataFrame(training_points)
    
    def _process_snapshot(self, snapshot: Dict) -> List[Dict]:
        """Processera en snapshot till träningspunkter"""
        points = []
        
        # Hämta fishing quality
        fishing_quality = snapshot['fishingQuality']
        report_id = snapshot['reportId']
        
        # Processera alla marine data points i snapshoten
        for marine_point in snapshot['marineData']:
            # Endast använd punkter med fullständig data
            if not self._has_complete_data(marine_point):
                continue
                
            # Skapa träningspunkt
            point = {
                'latitude': marine_point['lat'],
                'longitude': marine_point['lng'],
                'timestamp': marine_point['timestamp'],
                'temperature': marine_point['temperature'],
                'salinity': marine_point['salinity'],
                'current_strength': marine_point['currentStrength'],
                'current_direction': marine_point['currentDirection'],
                'season_sin': marine_point['seasonSin'],
                'season_cos': marine_point['seasonCos'],
                'hours_before_report': marine_point['hoursBeforeReport'],
                'is_report_day': 1 if marine_point['isReportDay'] else 0,
                'fishing_quality': fishing_quality,
                'report_id': report_id
            }
            points.append(point)
            
        return points
    
    def _has_complete_data(self, marine_point: Dict) -> bool:
        """Kontrollera om marine point har alla nödvändiga data"""
        required_fields = ['temperature', 'salinity', 'currentStrength', 'currentDirection']
        return all(
            field in marine_point and 
            marine_point[field] is not None 
            for field in required_fields
        )

    # FIX 2: Lägg till saknad load_model metod
    def load_model(self, model_path: str = 'trained_mackerel_model_real_data.pkl'):
        """Ladda tränad modell från fil"""
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
            
        with open(model_path, 'rb') as f:
            self.model = pickle.load(f)
            
        print(f"✅ Modell laddad från {model_path}")
        return self.model
    
    def prepare_training_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Förbered features och target för träning"""
        X = df[self.feature_columns].values
        y = df['fishing_quality'].values

        # Konvertera till binär klassificering (bra fiske vs dåligt fiske)
        # Säkerställ att y är en numpy array av float
        y = np.asarray(y, dtype=float)
        y_binary = (y >= 0.6).astype(int)

        # Säkerställ att X och y_binary är numpy-arrayer av rätt typ
        X = np.asarray(X, dtype=float)
        y_binary = np.asarray(y_binary, dtype=int)

        return X, y_binary

    def train_model(self, X: np.ndarray, y: np.ndarray) -> Dict:
        """Träna logistisk regressionsmodell"""
        if len(X) < 50:
            raise ValueError(f"För få träningspunkter: {len(X)}. Behöver minst 50.")
            
        # Dela data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # Skapa pipeline med skalning
        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('classifier', LogisticRegression(random_state=42, max_iter=1000))
        ])
        
        # Träna modell
        pipeline.fit(X_train, y_train)
        
        # Utvärdera
        train_score = pipeline.score(X_train, y_train)
        test_score = pipeline.score(X_test, y_test)
        
        # Cross-validation
        cv_scores = cross_val_score(pipeline, X_train, y_train, cv=5)
        
        # Prediktioner för metriker
        y_pred = pipeline.predict(X_test)
        y_pred_proba = pipeline.predict_proba(X_test)[:, 1]
        
        # Spara tränad modell
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
            'feature_names': self.feature_columns,
            'training_points': len(X),
            'positive_class_ratio': y.mean()
        }
    
    def save_model(self, model_path: str = 'trained_mackerel_model_real_data.pkl'):
        """Spara tränad modell"""
        if self.model is None:
            raise ValueError("No trained model to save")
            
        with open(model_path, 'wb') as f:
            pickle.dump(self.model, f)
            
        print(f"✅ Modell sparad till {model_path}")
    
    def generate_coefficients_file(self, results: Dict, output_path: str = 'real_data_coefficients.json'):
        """Generera koefficienter-fil för användning i Python-script"""
        coefficients = {
            'method': 'real_marine_data_training',
            'trained_at': datetime.now().isoformat(),
            'data_source': 'marine_data_snapshots',
            'model_performance': {
                'accuracy': results['test_accuracy'],
                'auc_roc': results['auc_roc'],
                'cv_mean': results['cv_mean'],
                'cv_std': results['cv_std'],
                'training_points': results['training_points'],
                'positive_class_ratio': results['positive_class_ratio']
            },
            'coefficients': {
                'intercept': float(results['intercept']),
                'features': {}
            }
        }
        
        # Mappa koefficienter till feature-namn
        for i, feature in enumerate(self.feature_columns):
            coefficients['coefficients']['features'][feature] = float(results['coefficients'][i])
            
        with open(output_path, 'w') as f:
            json.dump(coefficients, f, indent=2)
            
        print(f"✅ Koefficienter sparade till {output_path}")
        
        # Skriv ut för copy-paste
        print("\n🔬 TRÄNADE KOEFFICIENTER (copy-paste till Python):")
        print("=" * 60)
        print(f"# Tränad på {results['training_points']} FAKTISKA datapunkter")
        print(f"# Accuracy: {results['test_accuracy']:.3f}, AUC-ROC: {results['auc_roc']:.3f}")
        print(f"intercept = {results['intercept']:.4f}")
        
        for i, feature in enumerate(self.feature_columns):
            print(f"beta_{feature} = {results['coefficients'][i]:.4f}")
        
        print("=" * 60)
    
    def plot_results(self, results: Dict, X: np.ndarray, y: np.ndarray):
        """Visualisera träningsresultat"""
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))
        
        # Confusion Matrix
        cm = results['confusion_matrix']
        sns.heatmap(cm, annot=True, fmt='d', ax=axes[0,0], cmap='Blues')
        axes[0,0].set_title('Confusion Matrix')
        axes[0,0].set_xlabel('Predicted')
        axes[0,0].set_ylabel('Actual')
        
        # Feature Importance
        feature_importance = np.abs(results['coefficients'])
        feature_names = self.feature_columns
        
        axes[0,1].barh(feature_names, feature_importance)
        axes[0,1].set_title('Feature Importance (|Coefficient|)')
        axes[0,1].set_xlabel('Absolute Coefficient Value')
        
        # Training Data Distribution
        axes[1,0].hist(y, bins=2, alpha=0.7, edgecolor='black')
        axes[1,0].set_title('Fishing Quality Distribution')
        axes[1,0].set_xlabel('Quality (0=Poor, 1=Good)')
        axes[1,0].set_ylabel('Count')
        
        # Model Performance
        metrics = ['Train Acc', 'Test Acc', 'CV Mean', 'AUC-ROC']
        values = [results['train_accuracy'], results['test_accuracy'], 
                 results['cv_mean'], results['auc_roc']]
        
        axes[1,1].bar(metrics, values)
        axes[1,1].set_title('Model Performance')
        axes[1,1].set_ylabel('Score')
        axes[1,1].set_ylim(0, 1)
        
        plt.tight_layout()
        plt.savefig('mackerel_model_real_data_results.png', dpi=300, bbox_inches='tight')
        print("✅ Resultat-plot sparad som 'mackerel_model_real_data_results.png'")
        
    def analyze_data_quality(self, df: pd.DataFrame):
        """Analysera kvaliteten på träningsdata"""
        print("\n📊 DATA QUALITY ANALYSIS")
        print("=" * 50)
        
        # Grundläggande statistik
        print(f"Totalt antal träningspunkter: {len(df)}")
        print(f"Antal unika rapporter: {df['report_id'].nunique()}")
        print(f"Tidsintervall: {df['timestamp'].min()} → {df['timestamp'].max()}")
        
        # Kvalitetsdistribution
        print(f"\n🎯 Fishing Quality Distribution:")
        quality_counts = df['fishing_quality'].value_counts().sort_index()
        for quality, count in quality_counts.items():
            print(f"  {quality:.1f}: {count} punkter ({count/len(df)*100:.1f}%)")
            
        # Saknad data
        print(f"\n🔍 Missing Data Analysis:")
        for col in self.feature_columns:
            missing = df[col].isna().sum()
            if missing > 0:
                print(f"  {col}: {missing} saknade värden ({missing/len(df)*100:.1f}%)")
                
        # Parameterområden
        print(f"\n🌡️ Parameter Ranges:")
        for col in ['temperature', 'salinity', 'current_strength']:
            if col in df.columns:
                print(f"  {col}: {df[col].min():.2f} → {df[col].max():.2f}")


def main():
    parser = argparse.ArgumentParser(description='Träna makrill-modell med faktiska marina data')
    parser.add_argument('--snapshots', help='Sökväg till marine data snapshots fil')
    parser.add_argument('--evaluate', action='store_true', help='Endast utvärdera befintlig modell')
    
    args = parser.parse_args()
    
    trainer = RealDataMackerelTrainer(args.snapshots)
    
    if args.evaluate:
        # Ladda befintlig modell för utvärdering
        try:
            trainer.load_model()
            print("✅ Befintlig modell laddad för utvärdering")
            # Implementera utvärdering här
        except Exception as e:
            print(f"❌ Kunde inte ladda befintlig modell: {e}")
        return
    
    try:
        print("🌟 MACKEREL MODEL TRAINER - REAL DATA VERSION")
        print("=" * 60)
        
        # FIX 3: Kontrollera om snapshots-fil finns innan träning
        if not os.path.exists(trainer.snapshots_path):
            print(f"❌ Snapshots-fil hittades inte: {trainer.snapshots_path}")
            print("\n💡 För att träna modellen behöver du:")
            print("1. Skapa minst 20 fiskerapporter i appen")
            print("2. Vänta på att marine data snapshots genereras automatiskt")
            print("3. Eller specificera en annan fil med --snapshots")
            print("\n📝 Exempel:")
            print("  python train_mackerel_model_real_data.py --snapshots path/to/snapshots.json")
            return
        
        print("📦 Laddar marine data snapshots...")
        df = trainer.load_snapshots_data()
        
        print("🔍 Analyserar data quality...")
        trainer.analyze_data_quality(df)
        
        print("⚙️ Förbereder träningsdata...")
        X, y = trainer.prepare_training_data(df)
        print(f"Features shape: {X.shape}")
        print(f"Target distribution: {np.bincount(y)}")
        
        print("🚀 Tränar modell...")
        results = trainer.train_model(X, y)
        
        print("\n🎯 TRÄNINGSRESULTAT:")
        print("=" * 40)
        print(f"Test Accuracy: {results['test_accuracy']:.3f}")
        print(f"AUC-ROC: {results['auc_roc']:.3f}")
        print(f"CV Score: {results['cv_mean']:.3f} ± {results['cv_std']:.3f}")
        print(f"Träningspunkter: {results['training_points']}")
        print(f"Positive class ratio: {results['positive_class_ratio']:.3f}")
        
        print("\n📊 Classification Report:")
        print(results['classification_report'])
        
        trainer.save_model()
        trainer.generate_coefficients_file(results)
        trainer.plot_results(results, X, y)
        
        print("\n🎉 FRAMGÅNGSRIK TRÄNING MED FAKTISKA DATA!")
        print("Nu kan du använda dessa koefficienter i din makrillsannolikhet-beräkning.")
        
    except Exception as e:
        print(f"❌ Fel under träning: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main() 