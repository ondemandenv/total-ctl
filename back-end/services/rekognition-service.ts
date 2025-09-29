// import { RekognitionClient, StartContentModerationCommand, GetContentModerationCommand, DetectModerationLabelsCommand, type ModerationLabel } from "@aws-sdk/client-rekognition";
// import { sleep } from "bun";
// import type { CredentialsService } from "./credentials-service";
// import type { UserWorldRegion } from "../models/user-world-region";
// import { MediaType } from "../models/media-type";
// import { isDebug } from "../tools/debug";
// import type { S3StorageService } from "./s3-service";

// const MODERATION_FAILED_LABEL = "moderation-failed";

// export class RekognitionService
// {
//     credentialsService: CredentialsService;
//     s3Service: S3StorageService;

//     constructor ( credentialsService: CredentialsService, s3Service: S3StorageService )
//     {
//         this.credentialsService = credentialsService;
//         this.s3Service = s3Service;
//     }

//     private moderateVideo = async ( fileKey: string, rekoClient: RekognitionClient, userRegion?: UserWorldRegion ): Promise<string[]> =>
//     {
//         const startCommand = new StartContentModerationCommand( {
//             Video: {
//                 S3Object: {
//                     Bucket: this.s3Service.getS3BucketName( userRegion ),
//                     Name: fileKey
//                 }
//             }
//         } );

//         // launch job
//         const startResponse = await rekoClient.send( startCommand );

//         // pool API for job response
//         const getCommand = new GetContentModerationCommand( {
//             JobId: startResponse.JobId,
//             MaxResults: 100
//         } );

//         let getResponse = await rekoClient.send( getCommand );

//         while ( getResponse.JobStatus === "IN_PROGRESS" )
//         {
//             // not ready, wait for a few secodns and try again
//             await sleep( 1000 ); // 1s
//             getResponse = await rekoClient.send( getCommand );
//         }

//         // not in progress, but not succeeded means failed
//         if ( getResponse.JobStatus !== "SUCCEEDED" )
//         {
//             return [ MODERATION_FAILED_LABEL ];
//         }

//         return nicefyLabels( getResponse.ModerationLabels?.map( raw => raw?.ModerationLabel! ) );
//     };

//     private moderateImage = async ( fileKey: string, rekoClient: RekognitionClient, userRegion?: UserWorldRegion ): Promise<string[]> =>
//     {
//         const detectCommand = new DetectModerationLabelsCommand( {
//             Image: {
//                 S3Object: {
//                     Bucket: this.s3Service.getS3BucketName( userRegion ),
//                     Name: fileKey
//                 }
//             }
//         } );

//         try
//         {
//             const response = await rekoClient.send( detectCommand );
//             return nicefyLabels( response.ModerationLabels );
//         }
//         catch ( e )
//         {
//             return [ MODERATION_FAILED_LABEL ];
//         }
//     };

//     public moderateFile = async ( fileKey: string, mediaType: MediaType, region?: UserWorldRegion ): Promise<string[]> =>
//     {
//         if ( isDebug() )
//         {
//             return [];
//         }

//         const credentials = this.credentialsService.getAwsClientConfig();
//         if ( region )
//         {
//             credentials.region = region;
//         }
//         const rekoClient = new RekognitionClient( credentials );

//         switch ( mediaType )
//         {
//             default:
//                 return [ "media-type-not-supported" ];
//             case MediaType.IMAGE:
//                 return await this.moderateImage( fileKey, rekoClient );
//             case MediaType.VIDEO:
//                 return await this.moderateVideo( fileKey, rekoClient );
//         }
//     };
// }

// function nicefyLabels ( rawLabels: ModerationLabel[] | undefined ): string[]
// {
//     if ( rawLabels === null || rawLabels === undefined )
//         return [];

//     const list: string[] = [];

//     rawLabels.forEach( ( rawLabel ) =>
//     {
//         const labelName = rawLabel?.Name;
//         if ( labelName !== undefined )
//         {
//             if ( list.indexOf( labelName ) == -1 )
//             {
//                 list.push( labelName );
//             }
//         }
//     } );

//     return list;
// }