// import { TaskStatus, type Task } from "../models/task";
// import type { CredentialsService } from "./credentials-service";
// import { Collection, MongoClient } from "mongodb";


// export class DataService
// {
//     public credentialsService: CredentialsService;
//     private client: MongoClient;

//     constructor ( credentialsService: CredentialsService )
//     {
//         this.credentialsService = credentialsService;
//         const connectionString = credentialsService.mongodbConnectionString;
//         const useTls = connectionString.indexOf( "tls=true" ) > 0;
//         if ( useTls )
//         {
//             this.client = new MongoClient( credentialsService.mongodbConnectionString, {
//                 tls: true,
//                 tlsCAFile: "global-bundle.pem" //aws doc db cert file
//             } );
//         }
//         else
//         {
//             this.client = new MongoClient( credentialsService.mongodbConnectionString ); 
//         }
//     }

//     public async initConnection ()
//     {
//         await this.client.connect();
//         this.getTaskCollection();
//     }

//     private getTaskCollection (): Collection<Task>
//     {
//         const db = this.client.db( DATABASE_NAME );
//         return db.collection<Task>( "tasks" );
//     }

//     public async createTask ( task: Task )
//     {
//         task.createdAt = new Date();
//         await this.getTaskCollection().insertOne( task );
//     }

//     public async deleteTask ( id: string ): Promise<boolean>
//     {
//         const result = await this.getTaskCollection().deleteOne( { id: id } );
//         return result.acknowledged;
//     }

//     public async updateTask ( task: Task )
//     {
//         task.updatedAt = new Date();
//         return this.getTaskCollection().updateOne( { id: task.id }, { $set: task } );
//     }

//     public async getTask ( id: string ): Promise<Task | null>
//     {
//         const result = await this.getTaskCollection().findOne( { id: id } );
//         return result as ( Task | null );
//     }

//     // gets next task from queue and save it to the worker id
//     // we need to run some checkings to make sure we dont introduce racing conditions
//     // as multiple workers might end up getting the same task
//     public async getNextTaskFromQueue ( workerId: string ): Promise<Task | null>
//     {
//         return await this.getTaskCollection().findOneAndUpdate(
//             {
//                 assignedWorkerId: undefined,
//                 assignedToWorkerAt: undefined,
//                 status: TaskStatus.MODERATION_SUCCESS
//             },
//             {
//                 $set: {
//                     assignedWorkerId: workerId,
//                     updatedAt: new Date(),
//                     assignedToWorkerAt: new Date()
//                 }
//             }
//         );
//     }
// }