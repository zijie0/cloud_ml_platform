from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, log_loss
import pandas as pd
import lightgbm as lgb
import mlflow
import mlflow.lightgbm
from prefect import task


def prepare_data(data_dir):
    df = pd.read_parquet(f'{data_dir}/processed/feature.parquet')
    flower_names = {'setosa': 0, 'versicolor': 1, 'virginica': 2}
    target = 'variety'
    features = [col for col in df.columns if col != target]

    X = df[features]
    y = df[target].map(flower_names)

    return X, y


@task(log_stdout=True)
def train_model(env_config,
                learning_rate=0.1,
                num_iterations=50,
                feature_fraction=0.8,
                bagging_fraction=0.8):
    # Enable auto logging
    base_uri = env_config.base_uri
    tracking_uri = base_uri + '/mlflow' if base_uri else ''
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.lightgbm.autolog()

    X, y = prepare_data(env_config.data_dir)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    train_data = lgb.Dataset(X_train, label=y_train)

    with mlflow.start_run() as run:
        # Train model
        params = {
            "objective": "multiclass",
            "num_class": 3,
            "learning_rate": learning_rate,
            "num_iterations": num_iterations,
            "metric": "multi_logloss",
            "feature_fraction": feature_fraction,
            "bagging_fraction": bagging_fraction,
            "seed": 42,
        }

        model = lgb.train(params, train_data, valid_sets=[train_data])

        # Evaluate model
        y_proba = model.predict(X_test)
        y_pred = y_proba.argmax(axis=1)

        loss = log_loss(y_test, y_proba)
        acc = accuracy_score(y_test, y_pred)

        # Log metrics
        mlflow.log_metrics({
            "log_loss": loss,
            "accuracy": acc
        })

    print("Run ID:", run.info.run_id)
