# Backstage Infrastructure Stack
The infrastructure stack to host backstage consists of:  
- ECS Fargate cluster
- ECS Service definition
- Public and Private subnets on a dedicated VPC

Resources per environment/stage (Test, Prod ~):  
- ECS Task definitions for each stage
- Aurora Serverless postgresql dbs for each stage
- Elastic Load Balancers for each stage
- ACM Certs for each stage
- Application Pipeline to build and deploy the application code in a container 

This stack is created and deployed by the infrastructure pipeline.

Multiple stages can be added by adding more stages to the `env.yaml` file. 
