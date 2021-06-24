from src.training.feature import build_features
from src.training.train import train_model
from prefect import Flow, Parameter
import hydra
import os
from omegaconf import DictConfig


def register_flow():
    base_uri = os.environ.get('BASE_URI')
    artifact_bucket = os.environ.get('ARTIFACT_BUCKET')
    config = DictConfig({
        'work_dir': '.',
        'data_dir': './data',
        's3_bucket': artifact_bucket,
        'base_uri': base_uri
    })
    with Flow('LightGBM Pipeline') as flow:
        learning_rate = Parameter('learning_rate', default=0.1)
        num_iterations = Parameter('num_iterations', default=50)
        feature_fraction = Parameter('feature_fraction', default=0.8)
        bagging_fraction = Parameter('bagging_fraction', default=0.8)
        build_features(config)
        train_model(config,
                    learning_rate=learning_rate,
                    num_iterations=num_iterations,
                    feature_fraction=feature_fraction,
                    bagging_fraction=bagging_fraction)
    flow.register("Iris Prediction")


@hydra.main(config_path="conf", config_name="config")
def main(config):
    with Flow('LightGBM Pipeline') as flow:
        build_features(config)
        train_model(config,
                    learning_rate=config.params.learning_rate,
                    num_iterations=config.params.num_iterations,
                    feature_fraction=config.params.feature_fraction,
                    bagging_fraction=config.params.bagging_fraction)
    flow.run()


if __name__ == '__main__':
    main()
