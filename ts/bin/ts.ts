#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraPipelineStack } from '../lib/infra-pipeline-stack';
import { BackstageStack } from '../lib/backstage-stack';
import { common } from '../configs/config';

const env = { account: common.AWS_ACCOUNT, region: common.AWS_REGION};
const stacks = [
  `${common.TAG_STACK_NAME}-pipeline`,
  `${common.TAG_STACK_NAME}`
]

const app = new cdk.App();
new InfraPipelineStack(app, stacks[0] , {
  env
}, stacks);
new BackstageStack(app, stacks[1] , {
  env
});

cdk.Tags.of(app).add("Name", common.TAG_STACK_NAME);
cdk.Tags.of(app).add("Product", common.TAG_STACK_PRODUCT || 'dev-portal');

// app.synth();