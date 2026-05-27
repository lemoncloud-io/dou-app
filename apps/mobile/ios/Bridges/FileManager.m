#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface FileManager : NSObject <RCTBridgeModule> {
    NSMutableDictionary<NSString *, NSNumber *> *_backgroundTasks;
}
@end

@implementation FileManager

RCT_EXPORT_MODULE();

- (instancetype)init {
    if (self = [super init]) {
        _backgroundTasks = [NSMutableDictionary dictionary];
    }
    return self;
}

- (dispatch_queue_t)methodQueue {
    return dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0);
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (NSString *)getCleanPath:(NSString *)path {
    NSString *cleanPath = path;
    if ([cleanPath hasPrefix:@"file://"]) {
        cleanPath = [cleanPath substringFromIndex:7];
    }
    cleanPath = [cleanPath stringByRemovingPercentEncoding];
    if (cleanPath) {
        cleanPath = [cleanPath precomposedStringWithCanonicalMapping];
    }
    return cleanPath;
}

- (NSDictionary *)constantsToExport {
    NSString *docPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    return @{
        @"DocumentDirectoryPath": docPath ?: @""
    };
}

RCT_EXPORT_METHOD(exists:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSString *cleanPath = [self getCleanPath:path];
    BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:cleanPath];
    resolve(@(exists));
}

RCT_EXPORT_METHOD(readChunk:(NSString *)path
                  length:(nonnull NSNumber *)length
                  offset:(nonnull NSNumber *)offset
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        NSString *cleanPath = [self getCleanPath:path];
        if (!cleanPath || ![[NSFileManager defaultManager] fileExistsAtPath:cleanPath]) {
            NSString *errDesc = [NSString stringWithFormat:@"File does not exist at path: %@ (Cleaned: %@)", path, cleanPath ?: @"nil"];
            reject(@"FILE_NOT_FOUND", errDesc, nil);
            return;
        }

        NSFileHandle *fileHandle = [NSFileHandle fileHandleForReadingAtPath:cleanPath];
        if (!fileHandle) {
            reject(@"READ_FAILED", @"Failed to open file for reading", nil);
            return;
        }

        unsigned long long fileSize = [fileHandle seekToEndOfFile];
        unsigned long long readOffset = [offset unsignedLongLongValue];
        unsigned long long readLength = [length unsignedLongLongValue];

        if (readOffset >= fileSize) {
            [fileHandle closeFile];
            resolve(@"");
            return;
        }

        if (readOffset + readLength > fileSize) {
            readLength = fileSize - readOffset;
        }

        [fileHandle seekToFileOffset:readOffset];
        NSData *data = [fileHandle readDataOfLength:(NSUInteger)readLength];
        [fileHandle closeFile];

        NSString *base64 = [data base64EncodedStringWithOptions:0];
        resolve(base64);
    } @catch (NSException *exception) {
        reject(@"READ_FAILED", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(readFile:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        NSString *cleanPath = [self getCleanPath:path];
        if (!cleanPath || ![[NSFileManager defaultManager] fileExistsAtPath:cleanPath]) {
            NSString *errDesc = [NSString stringWithFormat:@"File does not exist at path: %@ (Cleaned: %@)", path, cleanPath ?: @"nil"];
            reject(@"FILE_NOT_FOUND", errDesc, nil);
            return;
        }

        NSError *error = nil;
        NSData *data = [NSData dataWithContentsOfFile:cleanPath options:0 error:&error];
        if (error) {
            reject(@"READ_FAILED", error.localizedDescription, error);
            return;
        }

        NSString *base64 = [data base64EncodedStringWithOptions:0];
        resolve(base64);
    } @catch (NSException *exception) {
        reject(@"READ_FAILED", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(unlink:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        NSString *cleanPath = [self getCleanPath:path];
        if (![[NSFileManager defaultManager] fileExistsAtPath:cleanPath]) {
            resolve(@(NO));
            return;
        }

        NSError *error = nil;
        BOOL success = [[NSFileManager defaultManager] removeItemAtPath:cleanPath error:&error];
        if (error) {
            reject(@"UNLINK_FAILED", error.localizedDescription, error);
            return;
        }
        resolve(@(success));
    } @catch (NSException *exception) {
        reject(@"UNLINK_FAILED", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(startBackgroundTask:(NSString *)uploadId
                  fileName:(NSString *)fileName
                  progress:(nonnull NSNumber *)progress
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        @synchronized(_backgroundTasks) {
            // If already exists, we do not need to create a new one
            if (_backgroundTasks[uploadId]) {
                resolve(nil);
                return;
            }
            
            __block UIBackgroundTaskIdentifier bgTaskId = UIBackgroundTaskInvalid;
            NSString *taskName = [NSString stringWithFormat:@"io.chatic.dou.upload.%@", uploadId];
            
            bgTaskId = [[UIApplication sharedApplication] beginBackgroundTaskWithName:taskName expirationHandler:^{
                @synchronized(_backgroundTasks) {
                    [[UIApplication sharedApplication] endBackgroundTask:bgTaskId];
                    [_backgroundTasks removeObjectForKey:uploadId];
                }
            }];
            
            if (bgTaskId != UIBackgroundTaskInvalid) {
                _backgroundTasks[uploadId] = @(bgTaskId);
            }
        }
        resolve(nil);
    } @catch (NSException *exception) {
        reject(@"START_BG_TASK_FAILED", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(endBackgroundTask:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        @synchronized(_backgroundTasks) {
            NSNumber *bgTaskIdNumber = _backgroundTasks[uploadId];
            if (bgTaskIdNumber) {
                UIBackgroundTaskIdentifier bgTaskId = [bgTaskIdNumber unsignedIntegerValue];
                if (bgTaskId != UIBackgroundTaskInvalid) {
                    [[UIApplication sharedApplication] endBackgroundTask:bgTaskId];
                }
                [_backgroundTasks removeObjectForKey:uploadId];
            }
        }
        resolve(nil);
    } @catch (NSException *exception) {
        reject(@"END_BG_TASK_FAILED", exception.reason, nil);
    }
}

@end
