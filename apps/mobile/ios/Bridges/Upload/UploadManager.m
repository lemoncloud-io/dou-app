#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

/**
 * UploadManager (iOS Native Upload Engine - Phase 1)
 *
 * This module provides a native implementation of chunked upload with:
 * - pause / resume / cancel
 * - progress events to JS (UploadManagerStateChanged)
 * - retry with exponential backoff (best-effort)
 *
 * Important:
 * - This implementation is intentionally "legacy-contract compatible":
 *   it POSTs JSON with base64 `chunkData`, matching the current JS uploader contract.
 * - For "true" long-running background uploads on iOS, we should migrate to
 *   URLSession background configuration with file-based upload tasks and a server contract that
 *   does not require dynamic JSON bodies per chunk.
 * - Manual recovery is handled in JS via persisted state; iOS OS-level guarantees are not assumed.
 */

@interface UploadTaskState : NSObject
@property(nonatomic, strong) NSDictionary *payload;
@property(nonatomic, copy) NSString *uploadId;
@property(nonatomic, copy) NSString *status; // queued/uploading/paused/cancelled/completed/failed
@property(nonatomic, assign) long long uploadedBytes;
@property(nonatomic, assign) NSInteger lastChunkIndex;
@property(nonatomic, assign) NSInteger retryAttempt;
@property(nonatomic, assign) BOOL paused;
@property(nonatomic, assign) BOOL cancelled;
@property(nonatomic, strong, nullable) NSURLSessionTask *currentTask;
@property(nonatomic, strong) dispatch_queue_t queue;
@property(nonatomic, assign) UIBackgroundTaskIdentifier bgTaskId;
@end

@implementation UploadTaskState
@end

@interface UploadManager : RCTEventEmitter <RCTBridgeModule> {
  NSMutableDictionary<NSString *, UploadTaskState *> *_tasks;
  BOOL _hasListeners;
}
@end

@implementation UploadManager

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if (self = [super init]) {
    _tasks = [NSMutableDictionary dictionary];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"UploadManagerStateChanged" ];
}

- (void)startObserving {
  _hasListeners = YES;
}

- (void)stopObserving {
  _hasListeners = NO;
}

- (dispatch_queue_t)methodQueue {
  // Module methods are called from a background queue.
  return dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0);
}

#pragma mark - Helpers

- (NSString *)cleanFilePath:(NSString *)path {
  NSString *cleanPath = path ?: @"";
  if ([cleanPath hasPrefix:@"file://"]) {
    cleanPath = [cleanPath substringFromIndex:7];
  }
  cleanPath = [cleanPath stringByRemovingPercentEncoding];
  if (cleanPath) {
    cleanPath = [cleanPath precomposedStringWithCanonicalMapping];
  }
  return cleanPath;
}

- (void)beginBackgroundTaskIfNeeded:(UploadTaskState *)state {
  if (state.bgTaskId != UIBackgroundTaskInvalid) return;

  NSString *taskName = [NSString stringWithFormat:@"io.chatic.dou.upload.%@", state.uploadId];
  __block UIBackgroundTaskIdentifier bgId = UIBackgroundTaskInvalid;

  bgId = [[UIApplication sharedApplication] beginBackgroundTaskWithName:taskName
                                                     expirationHandler:^{
    // Best-effort cleanup: mark as paused so JS can recover later.
    state.paused = YES;
    state.status = @"paused";
    if (state.currentTask) {
      [state.currentTask cancel];
      state.currentTask = nil;
    }
    if (bgId != UIBackgroundTaskInvalid) {
      [[UIApplication sharedApplication] endBackgroundTask:bgId];
    }
    state.bgTaskId = UIBackgroundTaskInvalid;
  }];

  state.bgTaskId = bgId;
}

- (void)endBackgroundTaskIfNeeded:(UploadTaskState *)state {
  if (state.bgTaskId == UIBackgroundTaskInvalid) return;
  [[UIApplication sharedApplication] endBackgroundTask:state.bgTaskId];
  state.bgTaskId = UIBackgroundTaskInvalid;
}

- (void)emitState:(UploadTaskState *)state
         progress:(double)progress
        totalBytes:(long long)totalBytes
      errorMessage:(NSString *_Nullable)errorMessage {
  if (!_hasListeners) return;

  NSMutableDictionary *event = [NSMutableDictionary dictionary];
  event[@"uploadId"] = state.uploadId;
  event[@"status"] = state.status ?: @"uploading";
  event[@"progress"] = @(progress);
  event[@"uploadedBytes"] = @(state.uploadedBytes);
  event[@"totalBytes"] = @(totalBytes);
  event[@"lastChunkIndex"] = @(state.lastChunkIndex);
  event[@"retryAttempt"] = @(state.retryAttempt);
  if (errorMessage) event[@"errorMessage"] = errorMessage;

  [self sendEventWithName:@"UploadManagerStateChanged" body:event];
}

- (BOOL)isRetryableStatusCode:(NSInteger)code {
  return code >= 500 && code <= 599;
}

- (long long)backoffMsForAttempt:(NSInteger)attempt {
  // attempt: 1 -> 500ms, 2 -> 1000ms, 3 -> 2000ms
  long long base = 500;
  long long delay = base * (1LL << (attempt - 1));
  return MIN(delay, 5000);
}

- (NSData *)buildChunkRequestBodyWithUploadId:(NSString *)uploadId
                                     fileName:(NSString *)fileName
                                     mimeType:(NSString *)mimeType
                                   chunkIndex:(NSInteger)chunkIndex
                                  totalChunks:(NSInteger)totalChunks
                                       offset:(long long)offset
                                       length:(NSInteger)length
                                   totalBytes:(long long)totalBytes
                                    chunkData:(NSString *)chunkData {
  NSDictionary *bodyObj = @{
    @"uploadId": uploadId ?: @"",
    @"fileName": fileName ?: @"",
    @"mimeType": mimeType ?: @"application/octet-stream",
    @"chunkIndex": @(chunkIndex),
    @"totalChunks": @(totalChunks),
    @"offset": @(offset),
    @"length": @(length),
    @"totalBytes": @(totalBytes),
    @"chunkData": chunkData ?: @"",
  };

  NSError *err = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:bodyObj options:0 error:&err];
  if (err || !data) {
    @throw [NSException exceptionWithName:@"JSON_SERIALIZE_FAILED"
                                   reason:(err.localizedDescription ?: @"Failed to serialize request body")
                                 userInfo:nil];
  }
  return data;
}

- (NSString *)readChunkBase64:(NSString *)fileUri
                       offset:(long long)offset
                       length:(NSInteger)length {
  NSString *path = [self cleanFilePath:fileUri];
  if (path.length == 0) return @"";

  NSFileHandle *handle = [NSFileHandle fileHandleForReadingAtPath:path];
  if (!handle) {
    @throw [NSException exceptionWithName:@"FILE_NOT_FOUND" reason:@"Failed to open file handle" userInfo:nil];
  }

  @try {
    unsigned long long fileSize = [handle seekToEndOfFile];
    if ((unsigned long long)offset >= fileSize) return @"";

    unsigned long long readLength = (unsigned long long)length;
    if ((unsigned long long)offset + readLength > fileSize) {
      readLength = fileSize - (unsigned long long)offset;
    }

    [handle seekToFileOffset:(unsigned long long)offset];
    NSData *data = [handle readDataOfLength:(NSUInteger)readLength];
    return [data base64EncodedStringWithOptions:0] ?: @"";
  } @finally {
    [handle closeFile];
  }
}

#pragma mark - Public API

RCT_EXPORT_METHOD(enqueueUpload:(NSDictionary *)payload
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  NSString *uploadId = payload[@"uploadId"];
  NSString *fileUri = payload[@"fileUri"];
  NSString *fileName = payload[@"fileName"] ?: @"파일";
  NSNumber *fileSizeNum = payload[@"fileSize"];
  NSString *mimeType = payload[@"mimeType"] ?: @"application/octet-stream";
  NSString *uploadUrl = payload[@"uploadUrl"];

  if (uploadId.length == 0 || fileUri.length == 0 || uploadUrl.length == 0 || fileSizeNum == nil) {
    reject(@"INVALID_PAYLOAD", @"uploadId/fileUri/uploadUrl/fileSize are required", nil);
    return;
  }

  __block UploadTaskState *state = nil;
  @synchronized(_tasks) {
    state = _tasks[uploadId];
    if (!state) {
      state = [UploadTaskState new];
      state.uploadId = uploadId;
      state.payload = payload;
      state.status = @"queued";
      state.uploadedBytes = [payload[@"uploadedBytes"] longLongValue];
      state.lastChunkIndex = [payload[@"lastChunkIndex"] integerValue];
      state.retryAttempt = 0;
      state.paused = NO;
      state.cancelled = NO;
      state.bgTaskId = UIBackgroundTaskInvalid;
      state.queue =
          dispatch_queue_create([[NSString stringWithFormat:@"io.chatic.dou.upload.%@", uploadId] UTF8String],
                                DISPATCH_QUEUE_SERIAL);
      _tasks[uploadId] = state;
    } else {
      state.payload = payload;
      state.cancelled = NO;
      state.paused = NO;
    }
  }

  state.status = @"uploading";
  [self beginBackgroundTaskIfNeeded:state];

  // Start upload loop (sequential) on its own serial queue.
  dispatch_async(state.queue, ^{
    [self runUploadLoop:state fileUri:fileUri fileName:fileName mimeType:mimeType uploadUrl:uploadUrl];
  });

  resolve(@{ @"uploadId": uploadId, @"status": @"uploading", @"fileSize": fileSizeNum });
}

RCT_EXPORT_METHOD(pauseUpload:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  UploadTaskState *state = nil;
  @synchronized(_tasks) {
    state = _tasks[uploadId];
  }
  if (!state) {
    reject(@"NOT_FOUND", [NSString stringWithFormat:@"Upload task not found: %@", uploadId], nil);
    return;
  }

  dispatch_async(state.queue, ^{
    state.paused = YES;
    state.status = @"paused";
    if (state.currentTask) {
      [state.currentTask cancel];
      state.currentTask = nil;
    }
  });

  resolve(nil);
}

RCT_EXPORT_METHOD(resumeUpload:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  UploadTaskState *state = nil;
  @synchronized(_tasks) {
    state = _tasks[uploadId];
  }
  if (!state) {
    reject(@"NOT_FOUND", [NSString stringWithFormat:@"Upload task not found: %@", uploadId], nil);
    return;
  }

  dispatch_async(state.queue, ^{
    state.paused = NO;
    state.cancelled = NO;
    state.status = @"uploading";
    [self beginBackgroundTaskIfNeeded:state];

    NSDictionary *payload = state.payload;
    NSString *fileUri = payload[@"fileUri"] ?: @"";
    NSString *fileName = payload[@"fileName"] ?: @"파일";
    NSString *mimeType = payload[@"mimeType"] ?: @"application/octet-stream";
    NSString *uploadUrl = payload[@"uploadUrl"] ?: @"";

    [self runUploadLoop:state fileUri:fileUri fileName:fileName mimeType:mimeType uploadUrl:uploadUrl];
  });

  resolve(nil);
}

RCT_EXPORT_METHOD(cancelUpload:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  UploadTaskState *state = nil;
  @synchronized(_tasks) {
    state = _tasks[uploadId];
  }
  if (!state) {
    reject(@"NOT_FOUND", [NSString stringWithFormat:@"Upload task not found: %@", uploadId], nil);
    return;
  }

  dispatch_async(state.queue, ^{
    state.cancelled = YES;
    state.paused = NO;
    state.status = @"cancelled";
    if (state.currentTask) {
      [state.currentTask cancel];
      state.currentTask = nil;
    }
    [self endBackgroundTaskIfNeeded:state];
  });

  @synchronized(_tasks) {
    [_tasks removeObjectForKey:uploadId];
  }

  resolve(nil);
}

#pragma mark - Upload loop

- (void)runUploadLoop:(UploadTaskState *)state
              fileUri:(NSString *)fileUri
             fileName:(NSString *)fileName
             mimeType:(NSString *)mimeType
            uploadUrl:(NSString *)uploadUrl {
  if (state.cancelled || state.paused) return;

  NSNumber *fileSizeNum = state.payload[@"fileSize"];
  long long totalBytes = [fileSizeNum longLongValue];
  NSInteger chunkSize = [state.payload[@"chunkSize"] integerValue];
  if (chunkSize <= 0) chunkSize = 1024 * 1024;

  NSInteger totalChunks = (NSInteger)((totalBytes + chunkSize - 1) / chunkSize);

  for (NSInteger i = state.lastChunkIndex; i < totalChunks; i++) {
    if (state.cancelled || state.paused) break;

    long long offset = (long long)i * (long long)chunkSize;
    NSInteger length = (NSInteger)MIN((long long)chunkSize, totalBytes - offset);

    @autoreleasepool {
      NSString *base64Data = @"";
      @try {
        base64Data = [self readChunkBase64:fileUri offset:offset length:length];
      } @catch (NSException *exception) {
        state.status = @"failed";
        [self emitState:state
               progress:(double)state.uploadedBytes / (double)MAX(totalBytes, 1)
              totalBytes:totalBytes
            errorMessage:exception.reason];
        [self endBackgroundTaskIfNeeded:state];
        return;
      }

      BOOL ok = [self postChunkWithRetry:state
                                 uploadId:state.uploadId
                                  fileName:fileName
                                  mimeType:mimeType
                                 uploadUrl:uploadUrl
                                 chunkIndex:i
                                totalChunks:totalChunks
                                     offset:offset
                                     length:length
                                 totalBytes:totalBytes
                                  chunkData:base64Data];

      if (!ok) {
        state.status = @"failed";
        [self emitState:state
               progress:(double)state.uploadedBytes / (double)MAX(totalBytes, 1)
              totalBytes:totalBytes
            errorMessage:@"upload failed"];
        [self endBackgroundTaskIfNeeded:state];
        return;
      }
    }

    state.lastChunkIndex = i + 1;
    state.uploadedBytes = MIN(totalBytes, state.uploadedBytes + (long long)length);

    double progress = totalBytes > 0 ? (double)state.uploadedBytes / (double)totalBytes : 0;
    [self emitState:state progress:progress totalBytes:totalBytes errorMessage:nil];
  }

  if (state.cancelled) {
    [self endBackgroundTaskIfNeeded:state];
    return;
  }
  if (state.paused) {
    state.status = @"paused";
    [self emitState:state progress:(double)state.uploadedBytes / (double)MAX(totalBytes, 1) totalBytes:totalBytes errorMessage:nil];
    [self endBackgroundTaskIfNeeded:state];
    return;
  }

  state.status = @"completed";
  [self emitState:state progress:1.0 totalBytes:totalBytes errorMessage:nil];
  [self endBackgroundTaskIfNeeded:state];

  @synchronized(_tasks) {
    [_tasks removeObjectForKey:state.uploadId];
  }
}

- (BOOL)postChunkWithRetry:(UploadTaskState *)state
                   uploadId:(NSString *)uploadId
                    fileName:(NSString *)fileName
                    mimeType:(NSString *)mimeType
                   uploadUrl:(NSString *)uploadUrl
                   chunkIndex:(NSInteger)chunkIndex
                  totalChunks:(NSInteger)totalChunks
                       offset:(long long)offset
                       length:(NSInteger)length
                   totalBytes:(long long)totalBytes
                    chunkData:(NSString *)chunkData {
  NSInteger maxAttempts = 3;
  for (NSInteger attempt = 1; attempt <= maxAttempts; attempt++) {
    if (state.cancelled || state.paused) return NO;

    state.retryAttempt = attempt - 1;
    __block BOOL success = NO;
    __block NSError *taskError = nil;
    __block NSInteger statusCode = 0;
    __block NSString *errorText = nil;

    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:uploadUrl]];
    request.HTTPMethod = @"POST";
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:uploadId forHTTPHeaderField:@"X-Upload-ID"];
    [request setValue:[NSString stringWithFormat:@"%ld", (long)chunkIndex] forHTTPHeaderField:@"X-Chunk-Index"];
    [request setValue:[NSString stringWithFormat:@"%ld", (long)totalChunks] forHTTPHeaderField:@"X-Total-Chunks"];
    [request setValue:[NSString stringWithFormat:@"%lld", offset] forHTTPHeaderField:@"X-Chunk-Offset"];
    [request setValue:[NSString stringWithFormat:@"%ld", (long)length] forHTTPHeaderField:@"X-Chunk-Size"];
    [request setValue:[NSString stringWithFormat:@"%lld", totalBytes] forHTTPHeaderField:@"X-File-Size"];
    [request setValue:[fileName stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]] ?: fileName
       forHTTPHeaderField:@"X-File-Name"];

    NSDictionary *headers = state.payload[@"headers"];
    if ([headers isKindOfClass:[NSDictionary class]]) {
      for (NSString *key in headers) {
        id val = headers[key];
        if ([val isKindOfClass:[NSString class]]) {
          [request setValue:(NSString *)val forHTTPHeaderField:key];
        }
      }
    }

    NSData *body = [self buildChunkRequestBodyWithUploadId:uploadId
                                                  fileName:fileName
                                                  mimeType:mimeType
                                                chunkIndex:chunkIndex
                                               totalChunks:totalChunks
                                                    offset:offset
                                                    length:length
                                                totalBytes:totalBytes
                                                 chunkData:chunkData];
    request.HTTPBody = body;

    NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config];

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    NSURLSessionDataTask *task = [session dataTaskWithRequest:request
                                           completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
      if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
        statusCode = ((NSHTTPURLResponse *)response).statusCode;
      }
      if (data) {
        errorText = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
      }
      taskError = error;
      success = (error == nil) && (statusCode >= 200 && statusCode <= 299);
      dispatch_semaphore_signal(sem);
    }];

    state.currentTask = task;
    [task resume];

    long waitResult =
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(60 * NSEC_PER_SEC)));
    state.currentTask = nil;
    [session finishTasksAndInvalidate];

    if (waitResult != 0) {
      // Timeout; treat as retryable network failure.
      [task cancel];
      taskError = [NSError errorWithDomain:@"UploadManager"
                                      code:-1001
                                  userInfo:@{NSLocalizedDescriptionKey : @"Request timed out"}];
      statusCode = 0;
      success = NO;
    }

    if (success) {
      state.retryAttempt = 0;
      return YES;
    }

    BOOL retryable = (taskError != nil) || [self isRetryableStatusCode:statusCode];
    if (!retryable) {
      // 4xx or other non-retryable error
      NSString *msg = errorText.length > 0 ? errorText : (taskError.localizedDescription ?: @"request failed");
      [self emitState:state
             progress:(double)state.uploadedBytes / (double)MAX(totalBytes, 1)
            totalBytes:totalBytes
          errorMessage:[NSString stringWithFormat:@"Server returned status %ld: %@", (long)statusCode, msg]];
      return NO;
    }

    if (attempt >= maxAttempts) {
      NSString *msg = errorText.length > 0 ? errorText : (taskError.localizedDescription ?: @"request failed");
      [self emitState:state
             progress:(double)state.uploadedBytes / (double)MAX(totalBytes, 1)
            totalBytes:totalBytes
          errorMessage:[NSString stringWithFormat:@"Exceeded retries (status=%ld): %@", (long)statusCode, msg]];
      return NO;
    }

    long long backoffMs = [self backoffMsForAttempt:attempt];
    [self emitState:state
           progress:(double)state.uploadedBytes / (double)MAX(totalBytes, 1)
          totalBytes:totalBytes
        errorMessage:[NSString stringWithFormat:@"Retrying chunk %ld/%ld (attempt %ld/%ld)...",
                      (long)(chunkIndex + 1), (long)totalChunks, (long)(attempt + 1), (long)maxAttempts]];

    [NSThread sleepForTimeInterval:((double)backoffMs / 1000.0)];
  }

  return NO;
}

@end
