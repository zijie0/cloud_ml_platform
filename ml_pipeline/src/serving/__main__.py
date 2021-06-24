import os
import uvicorn
import mlflow
import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import boto3
import cloudpickle


class Size(BaseModel):
    length: float
    width: float


class PredictRequest(BaseModel):
    sepal: Size
    petal: Size


app = FastAPI()

model = mlflow.lightgbm.load_model(f'runs:/{os.environ["MLFLOW_RUN_ID"]}/model')
flower_name_by_index = {0: 'setosa', 1: 'versicolor', 2: 'virginica'}


def load_pipeline():
    bucket = os.environ['ARTIFACT_BUCKET']
    key = 'feature_pipeline.pkl'
    s3 = boto3.client('s3')
    response = s3.get_object(Bucket=bucket, Key=key)
    body = response['Body'].read()
    pipeline = cloudpickle.loads(body)
    return pipeline


@app.post("/predict")
def predict(request: PredictRequest):
    # Can be used for evaluation
    request_id = uuid.uuid4()
    df = pd.DataFrame(columns=['sepal_length', 'sepal_width', 'petal_length', 'petal_width'],
                      data=[[request.sepal.length, request.sepal.width, request.petal.length, request.petal.width]])

    pipeline = load_pipeline()
    df = pipeline.fit_transform(df)

    # TODO: save request for data and model monitoring
    y_pred = np.argmax(model.predict(df))
    return {"request_id": request_id, "flower": flower_name_by_index[y_pred]}


def main():
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
