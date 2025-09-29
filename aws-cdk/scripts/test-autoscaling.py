#!/usr/bin/env python3
"""
Script to execute the DocumentDB Auto Scaling Test Step Function
"""

import boto3
import json
import time
import sys
from datetime import datetime

def main():
    if len(sys.argv) < 2:
        print("Usage: python test-autoscaling.py <environment>")
        print("Example: python test-autoscaling.py main")
        sys.exit(1)
    
    environment = sys.argv[1]
    
    # Initialize AWS clients
    stepfunctions = boto3.client('stepfunctions')
    
    # Step Function ARN pattern
    state_machine_name = f"docdb-autoscaling-test-{environment}"
    
    try:
        # List state machines to find the correct ARN
        response = stepfunctions.list_state_machines()
        state_machine_arn = None
        
        for sm in response['stateMachines']:
            if sm['name'] == state_machine_name:
                state_machine_arn = sm['stateMachineArn']
                break
        
        if not state_machine_arn:
            print(f"Error: State machine '{state_machine_name}' not found")
            print("Available state machines:")
            for sm in response['stateMachines']:
                print(f"  - {sm['name']}")
            sys.exit(1)
        
        print(f"Found Step Function: {state_machine_arn}")
        
        # Prepare execution input
        execution_input = {
            "testId": f"autoscaling-test-{int(time.time())}",
            "testStartTime": datetime.utcnow().isoformat(),
            "environment": environment,
            "description": "Automated DocumentDB auto scaling test execution"
        }
        
        # Start execution
        execution_name = f"test-execution-{int(time.time())}"
        
        print(f"Starting execution: {execution_name}")
        print(f"Input: {json.dumps(execution_input, indent=2)}")
        
        start_response = stepfunctions.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(execution_input)
        )
        
        execution_arn = start_response['executionArn']
        print(f"Execution started: {execution_arn}")
        
        # Monitor execution
        print("\nMonitoring execution...")
        while True:
            describe_response = stepfunctions.describe_execution(
                executionArn=execution_arn
            )
            
            status = describe_response['status']
            print(f"Status: {status}")
            
            if status in ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED']:
                print(f"\nExecution completed with status: {status}")
                
                if 'output' in describe_response:
                    print("Output:")
                    output = json.loads(describe_response['output'])
                    print(json.dumps(output, indent=2))
                
                if status == 'FAILED' and 'error' in describe_response:
                    print("Error:")
                    print(describe_response['error'])
                    print("Cause:")
                    print(describe_response['cause'])
                
                break
            
            time.sleep(30)  # Check every 30 seconds
        
        # Get execution history for detailed analysis
        print("\nGetting execution history...")
        history_response = stepfunctions.get_execution_history(
            executionArn=execution_arn,
            maxResults=50,
            reverseOrder=True
        )
        
        print("Recent events:")
        for event in history_response['events'][:10]:  # Show last 10 events
            timestamp = event['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
            event_type = event['type']
            print(f"  {timestamp} - {event_type}")
            
            # Show details for important events
            if event_type in ['LambdaFunctionFailed', 'ExecutionFailed', 'TaskFailed']:
                if 'lambdaFunctionFailedEventDetails' in event:
                    details = event['lambdaFunctionFailedEventDetails']
                    print(f"    Error: {details.get('error', 'Unknown')}")
                    print(f"    Cause: {details.get('cause', 'Unknown')}")
        
        print(f"\nTest completed. Check the AWS Console for detailed results:")
        print(f"Step Functions: https://console.aws.amazon.com/states/home?region={boto3.Session().region_name}#/executions/details/{execution_arn}")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main() 