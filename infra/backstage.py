import yaml
from dotenv import dotenv_values
from aws_cdk import (
    core,
    aws_iam as iam,
    aws_secretsmanager as secrets,
    aws_codepipeline as codepipeline,
    aws_codepipeline_actions as actions,
    aws_codebuild as codebuild,
)
from collections import OrderedDict
from .common_resources import CommonResourceStack
from .stage_resources import StageResourceStack
from .app_pipeline import AppPipelineStack

class BackstageStack(core.Stack):

    def __init__(self, scope: core.Construct, construct_id: str, props: dict, stages: dict, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        github_repo = props.get("GITHUB_INFRA_REPO")
        github_org = props.get("GITHUB_ORG")

        crs = CommonResourceStack( self, "infra-common-resources", props)
        pipeline = AppPipelineStack(self, 'backstage-app-pipeline', props, crs)
        
        # we add deploy stages to the pipeline based on stages dict.
        for name,stage in stages.items():

            # dont pass these into the ECS container env.
            approval = stage.pop('STAGE_APPROVAL', False)
            emails = stage.pop('APPROVAL_EMAILS', None)
            # overload the shared env vars with those for the stage specifics if required. 
            props = {
                **props,
                **stage
            }
            srs = StageResourceStack(self, name, props, crs)

            # add a ECS deploy stage with the stage specific service, and an approval stage if requested.
            pipeline.add_deploy_stage(name, srs.ecs_stack.service, approval, emails)
