import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as eks from '@pulumi/eks';
import * as random from '@pulumi/random';
import * as k8s from '@pulumi/kubernetes';
import S3ServiceAccount from './S3ServiceAccount';
import TraefikRoute from './TraefikRoute';


// Create a Kubernetes cluster.
const cluster = new eks.Cluster('cloud-ml-eks', {
    createOidcProvider: true,
});

// Create database for MLFlow
const dbPassword = new random.RandomPassword('cloud-ml-db-password', {length: 16, special: false});
const db = new aws.rds.Instance('mlflow-db', {
    allocatedStorage: 5,
    engine: "postgres",
    engineVersion: "11.11",
    instanceClass: "db.t3.micro",  //small, medium, large...
    name: "mlflow",
    password: dbPassword.result,
    skipFinalSnapshot: true,
    vpcSecurityGroupIds: [cluster.clusterSecurityGroup.id, cluster.nodeSecurityGroup.id],
    username: "postgres"
});

// Create database for Prefect
// const prefectPassword = new random.RandomPassword('cloud-ml-prefect-password', {length: 16, special: false});
// const prefectDb = new aws.rds.Instance('prefect-db', {
//     allocatedStorage: 5,
//     engine: "postgres",
//     engineVersion: "11.11",
//     instanceClass: "db.t3.micro",  //small, medium, large...
//     name: "prefect",
//     password: prefectPassword.result,
//     skipFinalSnapshot: true,
//     vpcSecurityGroupIds: [cluster.clusterSecurityGroup.id, cluster.nodeSecurityGroup.id],
//     username: "prefect"
// });

// Create S3 Bucket for MLFlow
const mlflowBucket = new aws.s3.Bucket("mlflow-bucket");

// Create S3 Bucket for DVC
const dvcBucket = new aws.s3.Bucket("dvc-bucket");

// Create S3 Bucket for Artifacts
const artifactBucket = new aws.s3.Bucket("artifact-bucket");

// Install Traefik
const traefik = new k8s.helm.v3.Chart('traefik', {
    chart: 'traefik',
    fetchOpts: {repo: 'https://containous.github.io/traefik-helm-chart'},
}, {provider: cluster.provider})

// Install MLFlow
const mlflowNamespace = new k8s.core.v1.Namespace("mlflow-namespace", {
    metadata: {name: "mlflow"},
}, {provider: cluster.provider});

const mlflowServiceAccount = new S3ServiceAccount('mlflow-service-account', {
    namespace: mlflowNamespace.metadata.name,
    oidcProvider: cluster.core.oidcProvider!,
    readOnly: false,
}, {provider: cluster.provider});

const mlflow = new k8s.helm.v3.Chart("mlflow", {
    chart: "mlflow",
    namespace: mlflowNamespace.metadata.name,
    values: {
        "backendStore": {
            "postgres": {
                "username": db.username,
                "password": db.password,
                "host": db.address,
                "port": db.port,
                "database": "mlflow"
            }
        },
        "defaultArtifactRoot": mlflowBucket.bucket.apply((bucketName: string) => `s3://${bucketName}`),
        "serviceAccount": {
            "create": false,
            "name": mlflowServiceAccount.name,
        }
    },
    fetchOpts: {repo: "https://larribas.me/helm-charts"},
}, {provider: cluster.provider});


// Install Prefect
// const prefect = new k8s.helm.v3.Chart('prefect', {
//     chart: 'prefect-server',
//     values: {
//         "postgresql": {
//             "postgresqlDatabase": prefectDb.name,
//             "postgresqlUsername": prefectDb.username,
//             "postgresqlPassword": prefectDb.password,
//             "externalHostname": prefectDb.address,
//             "servicePort": prefectDb.port,
//         }
//     },
//     fetchOpts: {repo: 'https://prefecthq.github.io/server/'},
// }, {provider: cluster.provider})

// Expose MLFlow in Traefik as /mlflow 
new TraefikRoute('mlflow', {
    prefix: '/mlflow',
    service: mlflow.getResource('v1/Service', 'mlflow', 'mlflow'),
    namespace: mlflowNamespace.metadata.name,
}, {provider: cluster.provider, dependsOn: [mlflow]});

// Expose Prefect in Traefik as /prefect
// new TraefikRoute('prefect', {
//     prefix: '/prefect',
//     service: prefect.getResource('v1/Service', 'prefect-ui'),
//     namespace: 'default',
// }, {provider: cluster.provider, dependsOn: [prefect]});

// Service account for models with read only access to models
const modelsServiceAccount = new S3ServiceAccount('models-service-account', {
    namespace: 'default',
    oidcProvider: cluster.core.oidcProvider!,
    readOnly: true,
}, {provider: cluster.provider});

// Set ml.mycompany.com DNS record in Route53
// new aws.route53.Record("record", {
//   zoneId: "<ZONE ID>",
//   name: "ml.mycompany.com",
//   type: "CNAME",
//   ttl: 300,
//   records: [traefik.getResource('v1/Service', 'traefik').status.loadBalancer.ingress[0].hostname],
// });

export const kubeconfig = cluster.kubeconfig;
export const dvcBucketURI = dvcBucket.bucket.apply((bucketName: string) => `s3://${bucketName}`);
export const artifactBucketURI = artifactBucket.bucket.apply((bucketName: string) => `s3://${bucketName}`);
export const modelsServiceAccountName = modelsServiceAccount.name;
export const traefikURI = traefik.getResource('v1/Service', 'traefik').status.loadBalancer.ingress[0].hostname;
