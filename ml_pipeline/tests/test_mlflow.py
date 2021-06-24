import mlflow
import os
from random import random, randint
from mlflow import log_metric, log_param


def test_mlflow():
    base_uri = os.environ.get('BASE_URI')
    tracking_uri = base_uri + '/mlflow' if base_uri else ''
    mlflow.set_tracking_uri(tracking_uri)
    # Log a parameter (key-value pair)
    log_param("param1", randint(0, 100))

    # Log a metric; metrics can be updated throughout the run
    log_metric("foo", random())
    log_metric("foo", random() + 1)
