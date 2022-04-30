Obs! The role/stackdestroyer must have `"Service": "cloudformation.amazonaws.com"` as its principal..  
[See this Link](https://aws.amazon.com/premiumsupport/knowledge-center/cloudformation-role-arn-error/)  
aws cloudformation delete-stack --role-arn arn:aws:iam::814967776290:role/stackdestroyer --stack-name backstage-infra


aws s3 rm s3:// --recursive
aws s3 rb s3:// --force

If the bucket is versioned, removing all objects can be done with `rm-bucket-versions.py`
