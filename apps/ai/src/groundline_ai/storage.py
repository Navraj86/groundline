"""Reads uploaded files from S3-compatible object storage."""

import asyncio
from functools import lru_cache

import boto3
from botocore.config import Config

from groundline_ai.config import get_settings


@lru_cache
def _client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint or None,
        region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key or None,
        aws_secret_access_key=s.s3_secret_key or None,
        config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
    )


async def read_object(key: str) -> bytes:
    def _get() -> bytes:
        response = _client().get_object(Bucket=get_settings().s3_bucket, Key=key)
        return response["Body"].read()

    return await asyncio.to_thread(_get)
