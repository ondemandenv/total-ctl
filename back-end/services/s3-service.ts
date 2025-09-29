import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListBucketsCommand, HeadObjectCommand, DeleteObjectsCommand, type DeleteObjectCommandOutput, type HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import type { CredentialService } from "./credential-service";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from "stream";
import { getFileExtension, isUnderSizeLimit } from "../utils/file";

export class S3StorageService
{
    credentialsService: CredentialService;

    constructor ( credentialsService: CredentialService ){
      this.credentialsService = credentialsService;
    }

    public getS3BucketName(){
      return this.credentialsService.s3BucketName;
    }

    private getS3Client(){
      // use the defined S3Client on the ECS Container IAM role
      return new S3Client({});
    }

    public deleteFile = async (fileKey: string) =>
    {
        const s3Client = this.getS3Client();
        const command = new DeleteObjectCommand(
            {
                Bucket: this.getS3BucketName(),
                Key: fileKey
            } );

        return await s3Client.send( command );
    };

    /**
     * Remove one or more objects from S3 by key.
     * @param keys array of S3 object keys (e.g. "path/to/file.mp4")
     */
    public async deleteFiles(keys: string[]): Promise<DeleteObjectCommandOutput> {
      const s3Client = this.getS3Client();

      // map each key into the ObjectIdentifier { Key: string } shape
      const objects = keys.map(key => ({ Key: key }));

      const command = new DeleteObjectsCommand({
        Bucket: this.getS3BucketName(),
        Delete: { Objects: objects },
      });

      return await s3Client.send(command);
    }

    private async _getFileUrl(
      fileKey: string,
      s3Client: S3Client
    ): Promise<string | null> {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: this.getS3BucketName(),
          Key: fileKey,
        });
    
        await s3Client.send(headCommand);
    
        const getObjectCommand = new GetObjectCommand({
          Bucket: this.getS3BucketName(),
          Key: fileKey,
        });
    
        // @ts-ignore
        return await getSignedUrl(s3Client, getObjectCommand, {
          expiresIn: 7 * 24 * 60 * 60, // 7 days
        });
      } catch (error: any) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
          return null;
        }
        console.error("Unexpected error checking S3 file existence:", error);
        return null;
      }
    }

    public async getFileS3byBundleId(fileKey: string): Promise<string | null> {
      const s3Client = this.getS3Client();
      return await this._getFileUrl(fileKey, s3Client);
    }

    // https://stackoverflow.com/questions/66689614/how-to-save-file-from-s3-using-aws-sdk-v3\
    public downloadFileToDir = async (
      taskId: string,
      fileKey: string,
      contentType: string
    ): Promise<string> => {
      const root = path.join(__dirname, `./input/${taskId}`);
      const s3Client = this.getS3Client();
      const getObjectCommand = new GetObjectCommand({
        Bucket: this.getS3BucketName(),
        Key: fileKey,
      });

      const extension = getFileExtension(contentType);
      if (!extension) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // * Handle cases where the given fileKey doesn't have the extension
      const filePath = path.join(root, `${path.basename(fileKey, path.extname(fileKey))}.${extension}`);
      const dirPath = path.dirname(filePath);

      // Check if the file already exists (mostly for testing)
      if (fs.existsSync(filePath)) {
        console.log(`File already exists: ${filePath}`);
        return filePath;
      }

      const response = await s3Client.send(getObjectCommand);
      if (!response || !response.Body) {
        throw new Error(`Failed to download file: ${fileKey}`);
      }

      // Ensure the directory exists
      await fs.promises.mkdir(dirPath, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        if (response.Body instanceof Readable) {
          response.Body.pipe(fs.createWriteStream(filePath))
            .on('error', (err) => reject(err))
            .on('close', () => resolve());
        } else {
            reject(new Error('Response body is not a readable stream'));
        }
      });

      return filePath;
    };

    public async checkConnection(): Promise<{ connectionStatus: string; bucketName: string }> {
      const s3Client = this.getS3Client();
      try {
        await s3Client.send(new ListBucketsCommand({}));
        console.log("S3 connection is working!");
        return { connectionStatus: "connected", bucketName: this.getS3BucketName() };
      } catch (error: unknown) {
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        return { connectionStatus: errorMessage, bucketName: this.getS3BucketName() };
      }
    }

    public async generateSignedUploadUrl(
      fileKey: string,
      contentType: string,
      fileSize: number
    ): Promise<string> {
      const s3Client = this.getS3Client();

      if (!contentType.startsWith('video/')) {
        throw new Error(`Invalid file type for ${fileKey}. Expected a video file, got ${contentType}.`);
      }

      if (!isUnderSizeLimit(fileSize)) {
        throw new Error(`File ${fileKey} exceeds max size of 15MB.`);
      }

      const command = new PutObjectCommand({
        Bucket: this.getS3BucketName(),
        Key: fileKey,
        ContentType: contentType,
      });

      // Generate a signed URL valid for 15 minutes (900 seconds)
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      return signedUrl;
    }

    public uploadFile = async (
      fileKey: string,
      blob: Blob
    ) => {
      const s3Client = this.getS3Client();
      const command = new PutObjectCommand({
          Bucket: this.getS3BucketName(),
          Key: fileKey,
          Body: Buffer.from(await blob.arrayBuffer()),
          ContentType: blob.type,
      });

      const result = await s3Client.send(command);
      return result.$metadata.httpStatusCode == 200;
    };

    public async getObjectMetadata(fileKey: string): Promise<HeadObjectCommandOutput> {
      const s3Client = this.getS3Client();
      
      const command = new HeadObjectCommand({
        Bucket: this.getS3BucketName(),
        Key: fileKey
      });
      
      try {
        const response = await s3Client.send(command);
        return response;
      } catch (error) {
        console.error(`Error getting metadata for ${fileKey}:`, error);
        throw error;
      }
    }
}