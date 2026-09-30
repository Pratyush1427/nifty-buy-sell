"""The ML models. Each is a scikit-learn pipeline that accepts NaNs."""
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# key -> (label, description, factory). Order is the order shown in the dashboard.
MODELS = {
    "gbm": (
        "Gradient boosting",
        "Hundreds of small decision trees, each correcting the last. Captures non-linear effects and interactions between features.",
        lambda: HistGradientBoostingClassifier(
            learning_rate=0.03, max_iter=400, max_leaf_nodes=15, min_samples_leaf=400,
            l2_regularization=1.0, max_features=0.7, random_state=7,
        ),
    ),
    "logit": (
        "Logistic regression",
        "A linear model: each feature adds or subtracts a fixed amount. Simple, stable and hard to overfit.",
        lambda: make_pipeline(
            SimpleImputer(strategy="median"), StandardScaler(),
            LogisticRegression(C=0.05, max_iter=500),
        ),
    ),
    "forest": (
        "Random forest",
        "Many independent decision trees trained on random slices of the data, then averaged. Robust to noisy features.",
        lambda: make_pipeline(
            SimpleImputer(strategy="median"),
            RandomForestClassifier(
                n_estimators=150, max_depth=8, min_samples_leaf=300, max_features=0.4,
                max_samples=0.3, n_jobs=-1, random_state=7,
            ),
        ),
    ),
}
ENSEMBLE = "ensemble"
ENSEMBLE_LABEL = "ML ensemble"
ENSEMBLE_DESCRIPTION = "The average of the three models' probabilities. Averaging usually smooths out each model's individual mistakes."
