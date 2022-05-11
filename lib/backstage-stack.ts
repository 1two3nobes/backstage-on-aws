import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { 
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
  SecurityGroup,
  Vpc,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { common, stages } from '../configs/config';
import { Stage } from '../configs/types';
import { AppPipelineStack } from './app-pipeline';
import {
 } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Cluster, ContainerImage, Secret as ECSSecret } from "aws-cdk-lib/aws-ecs";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Secret, SecretStringGenerator } from 'aws-cdk-lib/aws-secretsmanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { AuroraPostgresEngineVersion, Credentials, DatabaseCluster, DatabaseClusterEngine, ParameterGroup, ServerlessCluster } from 'aws-cdk-lib/aws-rds';
import { ApplicationLoadBalancedFargateService, ApplicationLoadBalancedTaskImageOptions } from 'aws-cdk-lib/aws-ecs-patterns';


type StageSecrets = {
  [key: string]: ECSSecret
}
export class BackstageStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const {
      POSTGRES_PORT,
      CONTAINER_NAME,
      ECR_REPO_NAME
    } = common;
    
    const vpc = new Vpc(this, "ECS-VPC", { maxAzs: 2 });
    
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
          secretMapping.AUTH_GITHUB_CLIENT_ID = ECSSecret.fromSecretsManager(githubAuthSecret, 'id');
          secretMapping.AUTH_GITHUB_CLIENT_SECRET = ECSSecret.fromSecretsManager(githubAuthSecret, 'secret');
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
          includeSpace: false
        };

        const auroraCreds = new Secret(this, "AuroraCredentialsSecret", {
          secretName: `${name}-backstage-db-auth`,
          generateSecretString: secretString
        });

        secretMapping.POSTGRES_PASSWORD = ECSSecret.fromSecretsManager(auroraCreds, 'password');

        const auroraPostGres = new ServerlessCluster(this, 'PGDatabaseServerless', {
          engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
          parameterGroup: ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
          vpc,
          credentials: Credentials.fromSecret(auroraCreds),
          securityGroups: [auroraSecurityGroup],
          vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
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
          desiredCount: 2,
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

        ecsStack.targetGroup.configureHealthCheck({
          ...ecsStack.targetGroup.healthCheck,
          port: '7000',
        });
        
        pipeline.addDeployStage(id, ecsStack.service, stage.STAGE_APPROVAL, stage.APPROVAL_EMAILS)
      });
  }
}
