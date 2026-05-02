import os

import boto3
from botocore.client import BaseClient
from dotenv import load_dotenv
from fastapi import HTTPException, status

load_dotenv()


def _required_env(name: str) -> str:
    value = os.getenv(name, "")
    if not value:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Missing required Storj configuration: {name}.",
        )
    return value


def get_storj_bucket_name() -> str:
    return _required_env("STORJ_BUCKET_NAME")


def get_storj_client() -> BaseClient:
    endpoint_url = os.getenv("STORJ_ENDPOINT", "https://gateway.storjshare.io")
    access_key = _required_env("STORJ_ACCESS_KEY")
    secret_key = _required_env("STORJ_SECRET_KEY")

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
