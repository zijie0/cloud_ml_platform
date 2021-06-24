import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import * as k8s from '@pulumi/kubernetes';
import * as kx from '@pulumi/kubernetesx';
import TraefikRoute from './TraefikRoute';

const config = new pulumi.Config();
const baseStack = new pulumi.StackReference(config.require('baseStack'))

const provider = new k8s.Provider('provider', {
    kubeconfig: baseStack.requireOutput('kubeconfig'),
})

const image = awsx.ecr.buildAndPushImage('iris-image', {
    context: '../',
});

const podBuilder = new kx.PodBuilder({
    containers: [{
        image: image.imageValue,
        ports: {http: 80},
        env: {
            'LISTEN_PORT': '80',
            'MLFLOW_TRACKING_URI': baseStack.requireOutput('traefikURI').apply(
                (baseURI: string) => `http://${baseURI}/mlflow`),
            'MLFLOW_RUN_ID': config.require('runID'),
            'ARTIFACT_BUCKET': baseStack.requireOutput('artifactBucketURI'),
        }
    }],
    serviceAccountName: baseStack.requireOutput('modelsServiceAccountName'),
});

const deployment = new kx.Deployment('iris-serving', {
    spec: podBuilder.asDeploymentSpec({replicas: 1})
}, {provider});

const service = deployment.createService();


// Expose model in Traefik 
new TraefikRoute('iris', {
    prefix: '/models/iris',
    service,
    namespace: 'default',
}, {provider, dependsOn: [service]});
