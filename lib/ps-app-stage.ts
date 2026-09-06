import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PSBackendStack } from './ps-backend-stack';
import { PSWebsiteStack } from './ps-website-stack';
import { apiEndpointForStage } from './config';

export interface PSAppStageProps extends StageProps {
  domain: String,
  // Concrete per-stage value baked into the frontend build (see PSWebsiteStackProps). The API
  // endpoint isn't here: it's derived from `domain` (see apiEndpointForStage).
  userPoolClientId: string,
  websiteDomain?: string,
  websiteDomainAliases?: string[],
}
const defaultProps: PSAppStageProps = {
  domain: "Dev",
  userPoolClientId: "1pscc7mteomtr9o9upfbmc97bk",
}

export class PSAppStage extends Stage {
  constructor(scope: Construct, id: string, props: PSAppStageProps = defaultProps) {
    super(scope, id, props);
    const backendStack = new PSBackendStack(this, 'ps-backend', {
      domain: props.domain,
    });
    const websiteStack = new PSWebsiteStack(this, 'ps-website', {
      domain: props.domain,
      apiEndpoint: apiEndpointForStage(props.domain as string),
      userPoolClientId: props.userPoolClientId,
      websiteDomain: props.websiteDomain,
      websiteDomainAliases: props.websiteDomainAliases,
    });
  }
}