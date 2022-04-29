import { Stack, StackProps } from "aws-cdk-lib";
import { Secret, SecretStringGenerator } from "aws-cdk-lib/aws-secretsmanager";
import { ContainerImage, Secret as ECSSecret } from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancedTaskImageOptions,
  ApplicationLoadBalancedFargateService
} from "aws-cdk-lib/aws-ecs-patterns";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { CertificateValidation, Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { AuroraPostgresEngineVersion, Credentials, DatabaseCluster, DatabaseClusterEngine } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { common } from "../configs/config";
import { Stage } from "../configs/types";
import { CommonResourcesStack } from "./common-resources-stack";

type StageSecrets = {
  [key: string]: ECSSecret
}
export class StageResourcesStack extends Stack {

  public ecsStack: ApplicationLoadBalancedFargateService;
  
  constructor(scope: Construct, id: string, crs: CommonResourcesStack, stage: Stage, props?: StackProps) {
    super(scope, id, props);

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
      instanceProps: crs.auroraInstance,
      instances: 1
    });

    const ecsTaskOptions: ApplicationLoadBalancedTaskImageOptions = {
      image: ContainerImage.fromEcrRepository(crs.imageRepo),
      containerPort: Number(CONTAINER_PORT),
      environment: { ...common, POSTGRES_HOST: auroraPostGres.clusterEndpoint.hostname },
      containerName: CONTAINER_NAME,
      secrets: secretMapping,
      taskRole: crs.taskRole,
      enableLogging: true
    };

    this.ecsStack = new ApplicationLoadBalancedFargateService(this, "BackstageService", {
      cluster: crs.ecsCluster,
      cpu: 256,
      desiredCount: 1,
      memoryLimitMiB: 1024,
      publicLoadBalancer: true,
      securityGroups: [crs.fargateSecurityGroup],
      taskImageOptions: ecsTaskOptions,
      certificate: cert,
      redirectHTTP: true,
      domainName: fqdn,
      domainZone: hostedZone,
      enableECSManagedTags: true
    });
  }
}