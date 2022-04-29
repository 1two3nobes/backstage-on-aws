import { Stack, StackProps } from 'aws-cdk-lib';
import { 
  InstanceClass,
  InstanceProps,
  InstanceSize,
  InstanceType,
  Port,
  SecurityGroup,
  Vpc,
  SubnetType,
  MachineImage,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { common, stages } from '../configs/config';
import { Stage } from '../configs/types';
import { AppPipelineStack } from './app-pipeline';
import { StageResourcesStack } from './stage-resources-stack';
import {
 } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";


export class BackstageStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const {
      POSTGRES_PORT,
      CONTAINER_NAME,
      ECR_REPO_NAME
    } = common;
    
    const vpc = new Vpc(this, "ECS-VPC", { maxAzs: 1 });
    
    const fargateSecurityGroup = new SecurityGroup(this, "fargate-security-group", {
      securityGroupName: "FargateSecurityGroup",
      description: "Security Group for Fargate Task",
      vpc
    });

    const auroraSecurityGroup = new SecurityGroup(this, "aurora-security-group", {
      securityGroupName: "AuroraSecurityGroup",
      description: "Security Group for Aurora PostGres Database",
      vpc
    });

    auroraSecurityGroup.addIngressRule(fargateSecurityGroup, Port.tcp(Number(POSTGRES_PORT)));

    const auroraInstance: InstanceProps = {
      vpc,
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestAmazonLinux(),
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
      securityGroup: auroraSecurityGroup
    }

    const imageRepo = ECR_REPO_NAME
      ? Repository.fromRepositoryName(this, "repo", ECR_REPO_NAME)
      : new Repository(this, "repo", { repositoryName: CONTAINER_NAME, imageScanOnPush: true });
    
    const ecsCluster = new Cluster(this, "BackstageCluster", { vpc });
    const taskRole = new Role(this, "fargate-task-role", {
      roleName: 'Backstage-Fargate-Task-Role',
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com")
    });
    const bucket = new Bucket(this, "techdocs");


    const pipeline = new AppPipelineStack(this, "backstage-app-pipeline", { imageRepo }, props);

    Object
      .entries(stages)
      .map<{name: string, stage: Stage}>(([name, stage]) => ({ name, stage }))
      .forEach(({ name, stage }) => {
        new StageResourcesStack(this, name, {
          auroraInstance,
          imageRepo,
          taskRole,
          ecsCluster,
          fargateSecurityGroup,
          pipeline
        }, stage, props);
      });
  }
}
