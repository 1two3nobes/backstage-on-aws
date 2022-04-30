
export interface Config {
  common: Common;
  stages: Stages;
}

export interface Common {
  POSTGRES_PORT:             string;
  POSTGRES_DB:               string;
  POSTGRES_USER:             string;
  AWS_REGION:                string;
  AWS_ACCOUNT:               string;
  TAG_STACK_NAME:            string;
  TAG_STACK_PRODUCT:         string;
  CONTAINER_PORT:            string;
  CONTAINER_NAME:            string;
  DOMAIN_NAME:               string;
  ACM_ARN:                   string;
  ECR_REPO_NAME:             string;
  DOCKERFILE:                string;
  GITHUB_APP_REPO:           string;
  GITHUB_INFRA_REPO:         string;
  GITHUB_ORG:                string;
  CODESTAR_CONN_ARN:         string;
  CODESTAR_NOTIFY_ARN:       string;
  GITHUB_TOKEN_SECRET_NAME:  string;
  GITHUB_APP_SECRET_ARN:     string;
  AWS_AUTH_SECRET_NAME:      string;
}

export interface Stage {
  HOST_NAME?:               string;
  GITHUB_AUTH_SECRET_NAME?: string;
  NODE_ENV?:                string;
  LOG_LEVEL?:               string;
  STAGE_APPROVAL?:          boolean;
  APPROVAL_EMAILS?:         string[];
}

export interface Stages {
  test: Stage;
  prod: Stage;
}