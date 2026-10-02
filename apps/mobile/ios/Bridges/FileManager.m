#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>

@interface FileManager : NSObject <RCTBridgeModule>
@end

@implementation FileManager

RCT_EXPORT_MODULE();

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
        @"DocumentDirectoryPath": docPath ?: @"",
        // The folder an upload may read a `writeTempFile` file from; the debug screen's dummy files go here too.
        @"TransferTempPath": [NSTemporaryDirectory() stringByAppendingPathComponent:@"transfer-temp"]
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

RCT_EXPORT_METHOD(createDummyFile:(NSString *)path
                  sizeInBytes:(nonnull NSNumber *)sizeInBytes
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        NSString *cleanPath = [self getCleanPath:path];
        if ([[NSFileManager defaultManager] fileExistsAtPath:cleanPath]) {
            [[NSFileManager defaultManager] removeItemAtPath:cleanPath error:nil];
        }
        [[NSFileManager defaultManager] createDirectoryAtPath:[cleanPath stringByDeletingLastPathComponent]
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
        
        int fd = open([cleanPath UTF8String], O_RDWR | O_CREAT | O_TRUNC, 0666);
        if (fd < 0) {
            reject(@"CREATE_FAILED", @"Failed to open file", nil);
            return;
        }
        
        off_t size = [sizeInBytes longLongValue];
        if (ftruncate(fd, size) < 0) {
            close(fd);
            reject(@"CREATE_FAILED", @"Failed to truncate file", nil);
            return;
        }
        
        close(fd);
        resolve(cleanPath);
    } @catch (NSException *exception) {
        reject(@"CREATE_FAILED", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(downloadFile:(NSString *)url
                  toPath:(NSString *)toPath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    @try {
        NSURL *downloadURL = [NSURL URLWithString:url];
        if (!downloadURL) {
            reject(@"DOWNLOAD_FAILED", [NSString stringWithFormat:@"Invalid URL: %@", url], nil);
            return;
        }

        NSString *cleanPath = [self getCleanPath:toPath];
        if (!cleanPath) {
            reject(@"DOWNLOAD_FAILED", [NSString stringWithFormat:@"Invalid destination path: %@", toPath], nil);
            return;
        }

        NSURLSessionDownloadTask *task = [[NSURLSession sharedSession] downloadTaskWithURL:downloadURL
                                                                         completionHandler:^(NSURL *location, NSURLResponse *response, NSError *error) {
            NSFileManager *fileManager = [NSFileManager defaultManager];
            if (error) {
                [fileManager removeItemAtPath:cleanPath error:nil];
                reject(@"DOWNLOAD_FAILED", error.localizedDescription, error);
                return;
            }

            if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                NSInteger statusCode = ((NSHTTPURLResponse *)response).statusCode;
                if (statusCode < 200 || statusCode > 299) {
                    [fileManager removeItemAtPath:cleanPath error:nil];
                    reject(@"DOWNLOAD_FAILED", [NSString stringWithFormat:@"Download failed with HTTP status: %ld", (long)statusCode], nil);
                    return;
                }
            }

            NSString *parentDir = [cleanPath stringByDeletingLastPathComponent];
            [fileManager createDirectoryAtPath:parentDir withIntermediateDirectories:YES attributes:nil error:nil];
            if ([fileManager fileExistsAtPath:cleanPath]) {
                [fileManager removeItemAtPath:cleanPath error:nil];
            }

            NSError *moveError = nil;
            BOOL moved = [fileManager moveItemAtURL:location
                                              toURL:[NSURL fileURLWithPath:cleanPath]
                                              error:&moveError];
            if (!moved) {
                [fileManager removeItemAtPath:cleanPath error:nil];
                reject(@"DOWNLOAD_FAILED", moveError.localizedDescription ?: @"Failed to move downloaded file", moveError);
                return;
            }

            resolve(cleanPath);
        }];
        [task resume];
    } @catch (NSException *exception) {
        reject(@"DOWNLOAD_FAILED", exception.reason, nil);
    }
}

/// Keeps only characters that are safe in a file name, so a caller-supplied name can never climb
/// out of the temp folder or produce an unwritable path. The UUID prefix keeps names unique.
- (NSString *)safeTempFileName:(NSString *)fileName {
    NSString *base = [(fileName ?: @"") lastPathComponent];
    NSMutableCharacterSet *allowed = [NSMutableCharacterSet alphanumericCharacterSet];
    [allowed addCharactersInString:@"._-"];
    NSMutableString *safe = [NSMutableString string];
    [base enumerateSubstringsInRange:NSMakeRange(0, base.length)
                             options:NSStringEnumerationByComposedCharacterSequences
                          usingBlock:^(NSString *character, NSRange range, NSRange enclosing, BOOL *stop) {
        BOOL keep = [character rangeOfCharacterFromSet:[allowed invertedSet]].location == NSNotFound;
        [safe appendString:keep ? character : @"_"];
    }];
    while ([safe hasPrefix:@"."]) {
        [safe deleteCharactersInRange:NSMakeRange(0, 1)];
    }
    if (safe.length > 100) {
        NSString *extension = [safe pathExtension];
        NSString *stem = [[safe stringByDeletingPathExtension] substringToIndex:MIN((NSUInteger)80, [safe stringByDeletingPathExtension].length)];
        safe = [NSMutableString stringWithString:extension.length > 0 && extension.length <= 10
                    ? [stem stringByAppendingPathExtension:extension] : stem];
    }
    return safe.length > 0 ? safe : @"file";
}

/// Writes bytes the web prepared in memory (a resized image, for example) to a temp file and
/// resolves its file:// URL, because the transfer module uploads from files only.
RCT_EXPORT_METHOD(writeTempFile:(NSString *)base64
                  fileName:(nullable NSString *)fileName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 ?: @""
                                                       options:NSDataBase64DecodingIgnoreUnknownCharacters];
    if (!data) {
        reject(@"WRITE_FAILED", @"The content is not valid base64", nil);
        return;
    }

    NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:@"transfer-temp"];
    NSError *error = nil;
    if (![[NSFileManager defaultManager] createDirectoryAtPath:directory
                                   withIntermediateDirectories:YES
                                                    attributes:nil
                                                         error:&error]) {
        reject(@"WRITE_FAILED", error.localizedDescription ?: @"Failed to create the temp folder", error);
        return;
    }

    NSString *name = [NSString stringWithFormat:@"%@-%@", [[NSUUID UUID] UUIDString], [self safeTempFileName:fileName]];
    NSString *path = [directory stringByAppendingPathComponent:name];
    if (![data writeToFile:path options:NSDataWritingAtomic error:&error]) {
        reject(@"WRITE_FAILED", error.localizedDescription ?: @"Failed to write the temp file", error);
        return;
    }
    resolve([[NSURL fileURLWithPath:path] absoluteString]);
}

@end
