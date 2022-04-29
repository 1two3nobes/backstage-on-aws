import { Stack, StackProps } from 'aws-cdk-lib';
import { BuildSpec, PipelineProject, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CloudFormationCreateReplaceChangeSetAction, CloudFormationExecuteChangeSetAction, CodeBuildAction, CodeStarConnectionsSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { common } from '../configs/config';

export class InfraPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps, stacks?: string[]) {
    super(scope, id, props);

    const { CODESTAR_CONN_ARN, GITHUB_INFRA_REPO, GITHUB_ORG } = common;

    const sourceArtifact = new Artifact();
    const synthArtifact = new Artifact();

    const pipeline = new Pipeline(this, "infra-pipeline", {
      pipelineName: id
    });

    const sourceAction = new CodeStarConnectionsSourceAction({
      actionName: "Github-Source",
      connectionArn: CODESTAR_CONN_ARN,
      repo: GITHUB_INFRA_REPO,
      owner: GITHUB_ORG,
      branch: 'main',
      output: sourceArtifact
    });

    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction]
    });

    const synthProject = new PipelineProject(this, "CodeBuildProject", {
      projectName: id,
      buildSpec: BuildSpec.fromSourceFilename('./configs/infra-buildspec.yml'),
      environment: { buildImage: LinuxBuildImage.STANDARD_5_0 }
    });

    const codeBuildPolicy = new PolicyStatement({
      actions: ["*"],
      resources: ["*"]
    });

    synthProject.addToRolePolicy(codeBuildPolicy);

    const synthAction = new CodeBuildAction({
      actionName: "Synth",
      project: synthProject,
      input: sourceArtifact,
      outputs:[synthArtifact]
    });

    pipeline.addStage({
      stageName: "Synth",
      actions: [synthAction]
    });

    stacks
      ?.map(stack => ({
        stageName: `Deploy-${stack}`,
        actions: [
          new CloudFormationCreateReplaceChangeSetAction({
            actionName: `Create-${stack}-ChangeSet`,
            stackName: stack,
            templatePath: synthArtifact.atPath(`${stack}.template.json`),
            adminPermissions: true,
            changeSetName: `Deploy-${stack}`
          }),
          new CloudFormationExecuteChangeSetAction({
            actionName: `Exec-${stack}-ChangeSet`,
            stackName: stack,
            changeSetName: `Deploy-${stack}`,
            runOrder: 2
          })
        ]
      }))
      ?.map(stage => pipeline.addStage(stage));
  }
}
