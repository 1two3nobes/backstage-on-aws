import { readFileSync } from "fs";
import { Stack, StackProps } from "aws-cdk-lib";
import { IBaseService } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import { parse } from "yaml";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeStarConnectionsSourceAction, EcsDeployAction, ManualApprovalAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { common } from "../configs/config";
import { BuildSpec, LinuxBuildImage, PipelineProject, BuildEnvironmentVariable } from "aws-cdk-lib/aws-codebuild";
import { ManagedPolicy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { IRepository } from "aws-cdk-lib/aws-ecr";

type ResourceDependencies = {
  imageRepo: IRepository
}
export class AppPipelineStack extends Stack {

  private pipeline: Pipeline;
  private buildArtifact: Artifact;

  constructor(scope: Construct, id: string, deps: ResourceDependencies, props?: StackProps) {
    super(scope, id, props);

    const { imageRepo } = deps;

    const {
      CODESTAR_CONN_ARN,
      GITHUB_APP_REPO,
      GITHUB_ORG,
      GITHUB_APP_SECRET_ARN,
      AWS_ACCOUNT,
      AWS_REGION,
      CONTAINER_NAME,
      DOCKERFILE
    } = common;

    const buildSpec = parse(readFileSync('./configs/app-buildspec.yaml', { encoding: 'utf8' }));

    const sourceArtifact = new Artifact();
    this.buildArtifact = new Artifact();


    const sourceAction = new CodeStarConnectionsSourceAction({
      actionName: "Github-Source",
      connectionArn: CODESTAR_CONN_ARN,
      repo: GITHUB_APP_REPO,
      owner: GITHUB_ORG,
      branch: 'main',
      output: sourceArtifact
    });

    const buildProject = new PipelineProject(this, "backstage-app-pipeline",{
      buildSpec: BuildSpec.fromObject(buildSpec),
      environment: { buildImage: LinuxBuildImage.STANDARD_5_0 }
    });

    const policy = ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryPowerUser");
    buildProject.role?.addManagedPolicy(policy);

    const secretsPolicy = new PolicyStatement({
      resources: [GITHUB_APP_SECRET_ARN],
      actions: ["secretsmanager:GetSecretValue"],
    });
    buildProject.addToRolePolicy(secretsPolicy);

    const repoUri = imageRepo.repositoryUri;
    const baseRepoUri = `${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com`;

    const buildAction = new CodeBuildAction({
      actionName: "Docker-Build",
      project: buildProject,
      input: sourceArtifact,
      outputs:[this.buildArtifact],
      environmentVariables: {
        BASE_REPO_URI: { value: baseRepoUri},
        GITHUB_APP_SECRET_ARN: { value: GITHUB_APP_SECRET_ARN },
        REPOSITORY_URI: { value: repoUri },
        AWS_REGION: { value: AWS_REGION },
        CONTAINER_NAME: { value: CONTAINER_NAME },
        DOCKERFILE: { value: DOCKERFILE },
      }
    });

    this.pipeline = new Pipeline(this, "backstagepipeline", {
      crossAccountKeys: false,
      pipelineName: "backstage-app-pipeline",
    });

    this.pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction]
    });

    this.pipeline.addStage({
      stageName: "Build",
      actions: [buildAction]
    });

  }

  addDeployStage(name: string, fargateService: IBaseService, approval?: boolean, emails?: string[]) {
    const dps = this.pipeline.addStage({
      stageName: `${name}-deploy`
    });
    let runOrder = 1;
    if (approval) {
      dps.addAction(new ManualApprovalAction({
        actionName: `${name}-stage-approval`,
        notifyEmails: emails,
        runOrder
      }));
      runOrder++;
    }

    dps.addAction(new EcsDeployAction({
      service: fargateService,
      actionName: `${name}-deploy`,
      input: this.buildArtifact,
      runOrder
    }))
  } 
}