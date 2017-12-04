'use strict';
const LocalstackPlugin = require('../../src/index');
const chai = require('chai');
const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs')
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const Serverless = require('serverless')
const AwsProvider = require('serverless/lib/plugins/aws/provider/awsProvider')
const path = require('path');
const localstackEndpointsFile = path.normalize( path.join(__dirname, '../../example/service/localstack_endpoints.json') );

chai.use(require('chai-string'));

// Enable for more verbose logging
const debug = false;

describe("LocalstackPlugin", () => {

  let serverless;
  let awsProvider;
  let awsConfig;
  let instance;
  let sandbox;
  let config = {
    host: 'http://localhost',
    debug: debug
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    serverless = new Serverless();
    awsProvider = new AwsProvider(serverless, {});
    awsConfig = new AWS.Config();
    AWS.config = awsConfig;
    awsProvider.sdk = AWS;
    awsProvider.config = awsConfig;
    serverless.init();
    serverless.setProvider('aws', awsProvider);
    serverless.cli.log = () => {
      if (debug) {
        console.log.apply(this, arguments);
      }
    }
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor()', () => {
    describe('with empty configuration', () => {

        beforeEach(() => {
          serverless.service.custom = {};
          instance = new LocalstackPlugin(serverless, {});
        });

        it('should not set the endpoints', () => {
          expect(instance.endpoints).to.be.empty;
        });

        it('should not set the endpoint file', () => {
          expect(instance.endpointFile).to.be.empty;
        });
    });

    describe('with config file provided', () => {
      beforeEach(() => {
        serverless.service.custom = {
          localstack: {
            endpointFile: localstackEndpointsFile
          }
        };
        instance = new LocalstackPlugin(serverless, {})
      });

      it('should set the endpoint file', () => {
        expect(instance.endpointFile).to.equal(localstackEndpointsFile)
      });

      it('should copy the endpoints to the AWS provider options', ()=> {
        let endpoints = JSON.parse(fs.readFileSync(localstackEndpointsFile))

        expect(instance.endpoints).to.deep.equal(endpoints)
      });

      it('should fail if the endpoint file does not exist', () => {
        serverless.service.custom.localstack = {
          endpointFile: 'missing.json'
        }

        let plugin = () => { new LocalstackPlugin(serverless, {}) }

        expect(plugin).to.throw('Endpoint: "missing.json" is invalid:')
      });

      it('should fail if the endpoint file is not json', () => {
        serverless.service.custom.localstack = {
          endpointFile: 'README.md'
        }
        let plugin = () => { new LocalstackPlugin(serverless, {}) }
        expect(plugin).to.throw(/Endpoint: "README.md" is invalid:/)
      });

    });
  });

  describe('#request() bound on AWS provider', ()=>{
    let service;
    let credentials;

    beforeEach(()=> {
      class FakeService {
        constructor(_credentials) {
          credentials = _credentials;
        }

        foo() {
          return this;
        }

        send() {
          return this;
        }
      }

      serverless.providers.aws.sdk.S3 = FakeService;
      serverless.service.custom = {
        localstack: {
          endpointFile: localstackEndpointsFile,
        }
      }
    });

    it('should overwrite the S3 hostname', () => {
      let pathToTemplate = 'https://s3.amazonaws.com/path/to/template';
      let request = sinon.stub(awsProvider, 'request');
      instance = new LocalstackPlugin(serverless, {})
      awsProvider.request('S3','foo',{
        TemplateURL: pathToTemplate
      });

      expect(request.called).to.be.true;
      let templateUrl = request.firstCall.args[2].TemplateURL;
      expect(templateUrl).to.startsWith(`${config.host}`);
    });

    it('should not send validateTemplate calls to localstack', () => {
      let pathToTemplate = 'https://s3.amazonaws.com/path/to/template';
      let request = sinon.stub(awsProvider, 'request');
      instance = new LocalstackPlugin(serverless, {})
      awsProvider.request('S3','validateTemplate',{});

      expect(request.called).to.be.false;
    });

  });

})
