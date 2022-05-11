# Initialize and Deploy CDK project
This project is set up like a standard TypeScript CDK project.  

Start by installing the required dependencies.

```
$ npm i
```

At this point you can now synthesize the CloudFormation template for this code.

```
$ cdk synth
```
Finally, assuming no errors from synth, you have credentials to deploy to the account you wish, and you have set your env vars in a `env.yaml` file, you can deploy the infrastructure pipeline. 

Note: the infrastructure pipeline will build itself, then the `backstage-pipeline` stack including the application pipeline. It wont be until the app pipeline completes its first pass that a running task will be available in Fargate. 

```
$ cdk deploy --all
```
Now sit back, grab some coffee, and watch Cloudformation and codepipeline work as your infrastructure and backstage app come to life!

Enjoy!