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

  # State in S3 with native locking: terraform init -backend-config=backend.hcl
  # (see backend.hcl.example and docs/deploy-aws-terraform.md).
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
