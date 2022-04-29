import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { stages } from '../configs/config';
import { Stage } from '../configs/types';
import { AppPipelineStack } from './app-pipeline';
import { CommonResourcesStack } from './common-resources-stack';
import { StageResourcesStack } from './stage-resources-stack';

export class BackstageStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const crs = new CommonResourcesStack(this, "infra-common-resources", props);
    const pipeline = new AppPipelineStack(this, "backstage-app-pipeline", crs, props);

    Object
      .entries(stages)
      .map<{name: string, stage: Stage}>(([name, stage]) => ({ name, stage }))
      .forEach(({ name, stage }) => {
        const srs = new StageResourcesStack(this, name, crs, stage, props);
        pipeline.addDeployStage(name, srs.ecsStack.service, stage.STAGE_APPROVAL, stage.APPROVAL_EMAILS)
      });
  }
}
