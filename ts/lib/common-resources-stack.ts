import { Stack, StackProps } from "aws-cdk-lib";
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
  ISecurityGroup
 } from "aws-cdk-lib/aws-ec2";
import { IRepository, Repository } from "aws-cdk-lib/aws-ecr";
import { Cluster, ICluster } from "aws-cdk-lib/aws-ecs";
import { IRole, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { common } from "../configs/config";

export class CommonResourcesStack extends Stack {

  public auroraInstance: InstanceProps;
  public imageRepo: IRepository;
  public taskRole: IRole;
  public ecsCluster: ICluster;
  public fargateSecurityGroup: ISecurityGroup;
  
  // public fargate
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const {
      POSTGRES_PORT,
      CONTAINER_NAME,
      ECR_REPO_NAME
    } = common;

    const vpc = new Vpc(this, "ECS-VPC", { maxAzs: 1 });

    this.fargateSecurityGroup = new SecurityGroup(this, "fargate-security-group", {
      securityGroupName: "FargateSecurityGroup",
      description: "Security Group for Fargate Task",
      vpc
    });

    const auroraSecurityGroup = new SecurityGroup(this, "aurora-security-group", {
      securityGroupName: "AuroraSecurityGroup",
      description: "Security Group for Aurora PostGres Database",
      vpc
    });

    auroraSecurityGroup.addIngressRule(this.fargateSecurityGroup, Port.tcp(Number(POSTGRES_PORT)));

    this.auroraInstance = {
      vpc,
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestAmazonLinux(),
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
      securityGroup: auroraSecurityGroup
    }

    this.imageRepo = ECR_REPO_NAME
      ? Repository.fromRepositoryName(this, "repo", ECR_REPO_NAME)
      : new Repository(this, "repo", { repositoryName: CONTAINER_NAME, imageScanOnPush: true })
    
    this.ecsCluster = new Cluster(this, "BackstageCluster", { vpc });
    this.taskRole = new Role(this, "fargate-task-role", {
      roleName: 'Backstage-Fargate-Task-Role',
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com")
    })
    const bucket = new Bucket(this, "techdocs");
  }
}