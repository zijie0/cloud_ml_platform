import boto3
import cloudpickle
import pandas as pd
from prefect import task
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.pipeline import make_pipeline


class CrossFeature(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        for prefix in ['sepal', 'petal']:
            new_col_name = f'{prefix}_mul'
            X[new_col_name] = X[f'{prefix}_length'] * X[f'{prefix}_width']
        return X


def feature_pipeline():
    pipeline = make_pipeline(CrossFeature())
    return pipeline


def persist_pipeline(pipeline, bucket):
    key = 'feature_pipeline.pkl'
    pkl_byte_obj = cloudpickle.dumps(pipeline)
    s3 = boto3.client('s3')
    s3.put_object(Bucket=bucket, Key=key, Body=pkl_byte_obj)


@task(log_stdout=True)
def build_features(env_config):
    input_path = f'{env_config.data_dir}/raw/iris.parquet'
    print(f'==== loading data from {input_path} ====')
    df = pd.read_parquet(input_path)
    pipeline = feature_pipeline()
    df = pipeline.fit_transform(df)
    output_path = f'{env_config.data_dir}/processed/feature.parquet'
    df.to_parquet(output_path)
    persist_pipeline(pipeline, env_config.s3_bucket)
    print('==== build feature success! ====')
