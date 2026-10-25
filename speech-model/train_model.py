import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix, \
    roc_curve
import matplotlib.pyplot as plt
import seaborn as sns
import pickle
import warnings

warnings.filterwarnings('ignore')


def load_and_prepare_data():
    """Load improved features and prepare for training"""
    print("Loading improved features...")
    df = pd.read_csv('results/pitt_features_improved.csv')

    # Separate features and labels FIRST
    feature_cols = [col for col in df.columns if col not in ['filename', 'label', 'participant_id']]

    # CRITICAL FIX: Clean string data before converting to arrays
    print("Cleaning data...")
    for col in feature_cols:
        # Check if column contains strings
        if df[col].dtype == 'object' or isinstance(df[col].iloc[0], str):
            # Remove brackets and convert to float
            df[col] = df[col].astype(str).str.strip('[]').astype(float)

    # Now convert to numpy arrays (after cleaning)
    X = df[feature_cols].values.astype(float)  # Force float type
    y = df['label'].map({'AD': 1, 'HC': 0}).values
    participant_ids = df['participant_id'].values

    # Handle any NaN or inf values
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    print(f"\nDataset Information:")
    print(f"  Total samples: {len(df)}")
    print(f"  Features: {len(feature_cols)}")
    print(f"  Alzheimer's (AD): {sum(y == 1)} samples ({100 * sum(y == 1) / len(y):.1f}%)")
    print(f"  Healthy (HC): {sum(y == 0)} samples ({100 * sum(y == 0) / len(y):.1f}%)")
    print(f"  Unique participants: {len(np.unique(participant_ids))}")

    return X, y, participant_ids, feature_cols, df


def select_best_features(X, y, n_features=50):
    """Select the most discriminative features"""
    print(f"\nPerforming feature selection (keeping top {n_features} features)...")

    # Use ANOVA F-test to select features
    selector = SelectKBest(f_classif, k=min(n_features, X.shape[1]))
    selector.fit(X, y)

    # Get feature scores
    scores = selector.scores_
    selected_indices = selector.get_support(indices=True)

    print(f"Selected {len(selected_indices)} features")

    return selector, selected_indices


def train_and_evaluate_models(X, y, participant_ids):
    """Train multiple models with improved cross-validation"""

    # Define models with better hyperparameters
    models = {
        'Logistic Regression': LogisticRegression(
            max_iter=2000,
            C=0.1,  # L2 regularization
            class_weight='balanced',
            random_state=42
        ),
        'Random Forest': RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_split=10,
            min_samples_leaf=5,
            class_weight='balanced',
            random_state=42
        ),
        'Gradient Boosting': GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            min_samples_split=10,
            random_state=42
        ),
        'SVM': SVC(
            kernel='rbf',
            C=1.0,
            gamma='scale',
            class_weight='balanced',
            probability=True,
            random_state=42
        )
    }

    # Use StratifiedGroupKFold to ensure:
    # 1. Same participant not in train and test
    # 2. Balanced class distribution in each fold
    n_splits = 5
    sgkf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=42)

    results = {}
    best_model_name = None
    best_auc = 0
    best_model_data = None

    print(f"\nTraining models with {n_splits}-fold Stratified Group Cross-Validation")
    print("(Each participant appears in only one fold)")
    print("=" * 80)

    for model_name, model in models.items():
        print(f"\n{model_name}:")
        print("-" * 60)

        fold_accuracies = []
        fold_precisions = []
        fold_recalls = []
        fold_f1s = []
        fold_aucs = []
        fold_specificities = []

        for fold_idx, (train_idx, test_idx) in enumerate(sgkf.split(X, y, groups=participant_ids)):
            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]

            # Scale features
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)

            # Train model
            model.fit(X_train_scaled, y_train)

            # Predict
            y_pred = model.predict(X_test_scaled)
            y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]

            # Calculate metrics
            acc = accuracy_score(y_test, y_pred)
            prec = precision_score(y_test, y_pred, zero_division=0)
            rec = recall_score(y_test, y_pred)  # Sensitivity
            f1 = f1_score(y_test, y_pred)
            auc = roc_auc_score(y_test, y_pred_proba)

            # Specificity
            tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0

            fold_accuracies.append(acc)
            fold_precisions.append(prec)
            fold_recalls.append(rec)
            fold_f1s.append(f1)
            fold_aucs.append(auc)
            fold_specificities.append(spec)

            print(f"  Fold {fold_idx + 1}: Acc={acc:.3f}, Sens={rec:.3f}, Spec={spec:.3f}, AUC={auc:.3f}")

        # Calculate mean and std
        mean_acc = np.mean(fold_accuracies)
        mean_auc = np.mean(fold_aucs)
        mean_sens = np.mean(fold_recalls)
        mean_spec = np.mean(fold_specificities)

        results[model_name] = {
            'accuracy': mean_acc,
            'accuracy_std': np.std(fold_accuracies),
            'precision': np.mean(fold_precisions),
            'sensitivity': mean_sens,  # Recall = Sensitivity
            'specificity': mean_spec,
            'f1': np.mean(fold_f1s),
            'auc': mean_auc,
            'auc_std': np.std(fold_aucs)
        }

        print(f"\n  AVERAGE PERFORMANCE:")
        print(f"    Accuracy:    {mean_acc:.3f} (±{np.std(fold_accuracies):.3f})")
        print(f"    Sensitivity: {mean_sens:.3f} (detects {mean_sens * 100:.1f}% of AD cases)")
        print(f"    Specificity: {mean_spec:.3f} (correctly identifies {mean_spec * 100:.1f}% of healthy)")
        print(f"    AUC:         {mean_auc:.3f} (±{np.std(fold_aucs):.3f})")

        # Track best model
        if mean_auc > best_auc:
            best_auc = mean_auc
            best_model_name = model_name
            best_model_data = (model, scaler)

    return results, best_model_name, best_model_data


def train_final_model(X, y, best_model_name):
    """Train final model on all data"""
    print("\n" + "=" * 80)
    print(f"Training final {best_model_name} model on full dataset...")

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Choose model based on best performer
    if best_model_name == 'Logistic Regression':
        final_model = LogisticRegression(max_iter=2000, C=0.1, class_weight='balanced', random_state=42)
    elif best_model_name == 'Random Forest':
        final_model = RandomForestClassifier(n_estimators=200, max_depth=10, class_weight='balanced', random_state=42)
    elif best_model_name == 'Gradient Boosting':
        final_model = GradientBoostingClassifier(n_estimators=100, learning_rate=0.05, max_depth=5, random_state=42)
    else:  # SVM
        final_model = SVC(kernel='rbf', class_weight='balanced', probability=True, random_state=42)

    final_model.fit(X_scaled, y)

    # Save model and scaler
    with open('models/best_model_improved.pkl', 'wb') as f:
        pickle.dump(final_model, f)

    with open('models/scaler_improved.pkl', 'wb') as f:
        pickle.dump(scaler, f)

    print(f"✅ Final {best_model_name} model saved to: models/best_model_improved.pkl")
    print("✅ Scaler saved to: models/scaler_improved.pkl")

    return final_model, scaler


def plot_confusion_matrix(y_true, y_pred, title='Confusion Matrix'):
    """Create confusion matrix visualization"""
    cm = confusion_matrix(y_true, y_pred)

    # Calculate percentages
    cm_percent = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis] * 100

    plt.figure(figsize=(10, 8))

    # Create annotations with both count and percentage
    annot = np.empty_like(cm).astype(str)
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            annot[i, j] = f'{cm[i, j]}\n({cm_percent[i, j]:.1f}%)'

    sns.heatmap(cm, annot=annot, fmt='', cmap='Blues',
                xticklabels=['Healthy (HC)', 'Alzheimer\'s (AD)'],
                yticklabels=['Healthy (HC)', 'Alzheimer\'s (AD)'],
                cbar_kws={'label': 'Count'})

    plt.title(title, fontsize=14, fontweight='bold')
    plt.ylabel('True Label', fontsize=12)
    plt.xlabel('Predicted Label', fontsize=12)
    plt.tight_layout()
    plt.savefig('results/confusion_matrix_improved.png', dpi=300)
    print("✅ Confusion matrix saved to: results/confusion_matrix_improved.png")
    plt.close()


def plot_roc_curve(y_true, y_pred_proba, title='ROC Curve'):
    """Create ROC curve visualization"""
    fpr, tpr, thresholds = roc_curve(y_true, y_pred_proba)
    auc = roc_auc_score(y_true, y_pred_proba)

    plt.figure(figsize=(10, 8))
    plt.plot(fpr, tpr, linewidth=3, label=f'Model (AUC = {auc:.3f})', color='#2E86AB')
    plt.plot([0, 1], [0, 1], 'k--', linewidth=2, label='Random Classifier (AUC = 0.500)')

    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate (1 - Specificity)', fontsize=12)
    plt.ylabel('True Positive Rate (Sensitivity)', fontsize=12)
    plt.title(title, fontsize=14, fontweight='bold')
    plt.legend(loc="lower right", fontsize=11)
    plt.grid(alpha=0.3, linestyle='--')
    plt.tight_layout()
    plt.savefig('results/roc_curve_improved.png', dpi=300)
    print("✅ ROC curve saved to: results/roc_curve_improved.png")
    plt.close()


def create_final_visualizations(X, y, best_model_name):
    """Create visualizations with final model"""
    print("\nCreating visualizations...")

    # Train on all data for visualization
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Use the best model
    if best_model_name == 'Random Forest':
        model = RandomForestClassifier(n_estimators=200, max_depth=10, class_weight='balanced', random_state=42)
    elif best_model_name == 'Gradient Boosting':
        model = GradientBoostingClassifier(n_estimators=100, learning_rate=0.05, max_depth=5, random_state=42)
    elif best_model_name == 'Logistic Regression':
        model = LogisticRegression(max_iter=2000, C=0.1, class_weight='balanced', random_state=42)
    else:
        model = SVC(kernel='rbf', class_weight='balanced', probability=True, random_state=42)

    model.fit(X_scaled, y)

    # Get predictions
    y_pred = model.predict(X_scaled)
    y_pred_proba = model.predict_proba(X_scaled)[:, 1]

    # Create plots
    plot_confusion_matrix(y, y_pred, f'Confusion Matrix - {best_model_name}')
    plot_roc_curve(y, y_pred_proba, f'ROC Curve - {best_model_name}')


def main():
    print("=" * 80)
    print("IMPROVED ALZHEIMER'S SPEECH CLASSIFICATION")
    print("=" * 80)

    # Load data
    X, y, participant_ids, feature_cols, df = load_and_prepare_data()

    # Train and evaluate models
    results, best_model_name, best_model_data = train_and_evaluate_models(X, y, participant_ids)

    # Print summary
    print("\n" + "=" * 80)
    print("FINAL RESULTS SUMMARY")
    print("=" * 80)

    # Sort by AUC
    sorted_results = sorted(results.items(), key=lambda x: x[1]['auc'], reverse=True)

    for rank, (model_name, metrics) in enumerate(sorted_results, 1):
        print(f"\n#{rank} {model_name}:")
        print(f"  Accuracy:    {metrics['accuracy']:.3f} ± {metrics['accuracy_std']:.3f}")
        print(f"  Sensitivity: {metrics['sensitivity']:.3f} (recall/true positive rate)")
        print(f"  Specificity: {metrics['specificity']:.3f} (true negative rate)")
        print(f"  Precision:   {metrics['precision']:.3f}")
        print(f"  F1-Score:    {metrics['f1']:.3f}")
        print(f"  AUC:         {metrics['auc']:.3f} ± {metrics['auc_std']:.3f}")

    print(f"\n🏆 BEST MODEL: {best_model_name} (AUC = {results[best_model_name]['auc']:.3f})")

    # Train final model
    final_model, scaler = train_final_model(X, y, best_model_name)

    # Create visualizations
    create_final_visualizations(X, y, best_model_name)

    print("\n" + "=" * 80)
    print("✅ IMPROVED TRAINING COMPLETE!")
    print("=" * 80)
    print("\nKey Improvements:")
    print("  ✓ 150+ advanced features (vs. 47 basic features)")
    print("  ✓ Better cross-validation (participant-grouped)")
    print("  ✓ Class balancing (handles imbalanced data)")
    print("  ✓ Multiple model comparison")
    print("  ✓ Regularization to prevent overfitting")


if __name__ == "__main__":
    main()