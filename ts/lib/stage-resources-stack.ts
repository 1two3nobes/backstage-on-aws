import { Stack, StackProps } from "aws-cdk-lib";
import { Secret, SecretStringGenerator } from "aws-cdk-lib/aws-secretsmanager";
import { ContainerImage, ICluster, Secret as ECSSecret } from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancedTaskImageOptions,
  ApplicationLoadBalancedFargateService
} from "aws-cdk-lib/aws-ecs-patterns";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { CertificateValidation, Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { AuroraPostgresEngineVersion, Credentials, DatabaseCluster, DatabaseClusterEngine } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { InstanceProps, ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import { IRole } from "aws-cdk-lib/aws-iam";
import { common } from "../configs/config";
import { Stage } from "../configs/types";
import { AppPipelineStack } from "./app-pipeline";

type StageSecrets = {
  [key: string]: ECSSecret
}
type ResourceDependencies = {
  auroraInstance: InstanceProps,
  imageRepo: IRepository,
  taskRole: IRole,
  ecsCluster: ICluster,
  fargateSecurityGroup: ISecurityGroup,
  pipeline: AppPipelineStack
}
export class StageResourcesStack extends Stack {
  
  constructor(scope: Construct, id: string, deps: ResourceDependencies, stage: Stage, props?: StackProps) {
    super(scope, id, props);

    const {
      auroraInstance,
      imageRepo,
      taskRole,
      ecsCluster,
      fargateSecurityGroup,
      pipeline
    } = deps;

    const { HOST_NAME, GITHUB_AUTH_SECRET_NAME } = stage;
    const {
      DOMAIN_NAME,
      AWS_AUTH_SECRET_NAME,
      ACM_ARN,
      POSTGRES_USER,
      CONTAINER_PORT,
      CONTAINER_NAME
    } = common;

    const fqdn = `${HOST_NAME}.${DOMAIN_NAME}`;

    const secretMapping: StageSecrets = {};

    if (GITHUB_AUTH_SECRET_NAME) {
      const githubAuthSecret = Secret.fromSecretNameV2(this, "github-auth-secret", GITHUB_AUTH_SECRET_NAME);
      secretMapping.GITHUB_AUTH_CLIENT_ID = ECSSecret.fromSecretsManager(githubAuthSecret, 'id');
      secretMapping.GITHUB_AUTH_CLIENT_SECRET = ECSSecret.fromSecretsManager(githubAuthSecret, 'secret');
      secretMapping.GITHUB_TOKEN = ECSSecret.fromSecretsManager(githubAuthSecret, 'pat');
    }
    
    if (AWS_AUTH_SECRET_NAME) {
      const awsAuthSecret = Secret.fromSecretNameV2(this, "aws-auth-secret", AWS_AUTH_SECRET_NAME);
      secretMapping.AWS_ACCESS_KEY_ID = ECSSecret.fromSecretsManager(awsAuthSecret, 'id');
      secretMapping.AWS_ACCESS_KEY_SECRET = ECSSecret.fromSecretsManager(awsAuthSecret, 'secret');
    }

    const hostedZone = HostedZone.fromLookup(this, "hostedzone", { domainName: DOMAIN_NAME });

    const cert = ACM_ARN 
      ? Certificate.fromCertificateArn(this, "Certificate", ACM_ARN)
      : new Certificate(this, "Certificate", {
        domainName: fqdn,
        validation: CertificateValidation.fromDns(hostedZone)
      });

    const secretString: SecretStringGenerator = {
      secretStringTemplate: JSON.stringify({ username: POSTGRES_USER }),
      generateStringKey: "password",
      excludePunctuation: true,
      includeSpace: true
    };

    const auroraCreds = new Secret(this, "AuroraCredentialsSecret", {
      secretName: `${id}-backstage-db-auth`,
      generateSecretString: secretString
    });

    secretMapping.POSTGRES_PASSWORD = ECSSecret.fromSecretsManager(auroraCreds, 'password');

    const auroraPostGres = new DatabaseCluster(this, "PGDatabase", {
      engine: DatabaseClusterEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_10_14 }),
      credentials: Credentials.fromSecret(auroraCreds),
      instanceProps: auroraInstance,
      instances: 1
    });

    const ecsTaskOptions: ApplicationLoadBalancedTaskImageOptions = {
      image: ContainerImage.fromEcrRepository(imageRepo),
      containerPort: Number(CONTAINER_PORT),
      environment: { ...common, POSTGRES_HOST: auroraPostGres.clusterEndpoint.hostname },
      containerName: CONTAINER_NAME,
      secrets: secretMapping,
      taskRole: taskRole,
      enableLogging: true
    };

    const ecsStack = new ApplicationLoadBalancedFargateService(this, "BackstageService", {
      cluster: ecsCluster,
      cpu: 256,
      desiredCount: 1,
      memoryLimitMiB: 1024,
      publicLoadBalancer: true,
      securityGroups: [fargateSecurityGroup],
      taskImageOptions: ecsTaskOptions,
      certificate: cert,
      redirectHTTP: true,
      domainName: fqdn,
      domainZone: hostedZone,
      enableECSManagedTags: true
    });

    
    pipeline.addDeployStage(id, ecsStack.service, stage.STAGE_APPROVAL, stage.APPROVAL_EMAILS)
  }
}