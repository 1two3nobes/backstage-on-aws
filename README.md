# Backstage Infrastructure
This project uses [CDK](https://docs.aws.amazon.com/cdk/latest/guide/home.html) to deploy a containerized version of your backstage instance along with the required infrastructure in into a AWS account, to host your own [Backstage](https://backstage.io) based service. It creates two independent stacks which deploy pipelines, infrastructure, and app image containers to AWS. 
It is assumed you have more than a passing familiarity with:
- CDK
- AWS
- Backstage
- Docker
- Node

> WARNING! Deploying these stacks to AWS will incur costs!

## Prerequisites
you will need to have at least the following installed and configured:
- nodejs 16
- aws cli
- aws cdk 2

and you will need to have your backstage application code in a separate repo from this one. 
