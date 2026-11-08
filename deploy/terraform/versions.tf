terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in S3 with native locking. Configure it per environment:
  #   terraform init -backend-config=backend.hcl
  # (see backend.hcl.example and docs/deploy-aws.md).
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "groundline"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
