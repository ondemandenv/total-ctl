export class CredentialService {
    // public ajoApiKey: string;
    // public ajoCompanyId: string;
    // public ajoSandboxName?: string;
    // public ajoCampaignId: string;
    // public ajoAuth: string;
    public mongodbConnectionString: string;
    public apiKeySecret: string;
    public s3BucketName: string;
    public accessKeyId: string;
    public secretAccessKey: string;
    public sessionToken: string;
    public rekognitionS3BucketName: string;

    constructor () {
        // this.ajoApiKey = process.env.TCCC_AJO_API_KEY || "";
        // this.ajoCompanyId = process.env.TCCC_AJO_COMPANY_ID || "";
        // this.ajoSandboxName = process.env.TCCC_AJO_SANDBOX_NAME;
        // this.ajoCampaignId = process.env.TCCC_AJO_CAMPAIGN_ID || "";
        // this.ajoAuth = process.env.TCCC_AJO_AUTH || "";
        // Mongo Configuration
        this.mongodbConnectionString = process.env.MONGODB_CONNECTION_STRING || "";
        this.apiKeySecret = process.env.API_KEY_SECRET || "secret2";
        // S3 Configuration
        this.s3BucketName = process.env.S3_BUCKET_NAME || "total-ctl-s3-storage";
        this.accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
        this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
        this.sessionToken = process.env.AWS_SESSION_TOKEN || "";
        // Rekognition and moderation
        this.rekognitionS3BucketName = process.env.REKOGNITION_S3_BUCKET_NAME || "rekognition-custom-projects-eu-west-1-951dfdd048";
    }
}