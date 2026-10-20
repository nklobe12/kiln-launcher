#import <CommonCrypto/CommonDigest.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import "KilnViewController.h"
#import "authenticator/BaseAuthenticator.h"
#import "installer/modpack/ModpackUtils.h"
#import "LauncherMenuViewController.h"
#import "LauncherNavigationController.h"
#import "LauncherPreferencesViewController.h"
#import "LauncherProfilesViewController.h"
#import "PLProfiles.h"
#import "UnzipKit.h"
#import "utils.h"

#pragma mark - Weak proxy (WKUserContentController retains its handlers)

@interface KilnWeakHandler : NSObject <WKScriptMessageHandlerWithReply>
@property(nonatomic, weak) id<WKScriptMessageHandlerWithReply> target;
@end

@implementation KilnWeakHandler
- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id _Nullable, NSString * _Nullable))replyHandler {
    id<WKScriptMessageHandlerWithReply> target = self.target;
    if (target) {
        [target userContentController:userContentController didReceiveScriptMessage:message replyHandler:replyHandler];
    } else {
        replyHandler(nil, @"Kiln view is gone");
    }
}
@end

#pragma mark - Download record

typedef void (^KilnReply)(id _Nullable result, NSString * _Nullable error);

@interface KilnDownload : NSObject
@property(nonatomic, copy) NSString *taskId;
@property(nonatomic, copy) NSString *destPath;
@property(nonatomic, copy) NSString *relPath;
@property(nonatomic, copy) NSString *sha1;
@property(nonatomic, copy) KilnReply reply;
@property(nonatomic) CFAbsoluteTime lastEmit;
@end
@implementation KilnDownload
@end

#pragma mark - View controller

@interface KilnViewController () <WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate,
    NSURLSessionDownloadDelegate, UIDocumentPickerDelegate>
@property(nonatomic) WKWebView *webView;
@property(nonatomic) NSURLSession *downloadSession;
@property(nonatomic) NSMutableDictionary<NSNumber *, KilnDownload *> *downloads;
@property(nonatomic) dispatch_queue_t ioQueue;
@property(nonatomic, copy) KilnReply pickReply;
@end

@implementation KilnViewController

- (id)init {
    self = [super init];
    self.title = @"Kiln";
    _downloads = [NSMutableDictionary new];
    _ioQueue = dispatch_queue_create("kiln.io", DISPATCH_QUEUE_CONCURRENT);
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.defaultSessionConfiguration;
    config.HTTPMaximumConnectionsPerHost = 6;
    config.timeoutIntervalForRequest = 60;
    NSOperationQueue *queue = [NSOperationQueue new];
    queue.maxConcurrentOperationCount = 1;
    _downloadSession = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:queue];
    return self;
}

- (NSString *)imageName {
    return @"flame";
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.systemBackgroundColor;

    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    KilnWeakHandler *handler = [KilnWeakHandler new];
    handler.target = self;
    [config.userContentController addScriptMessageHandlerWithReply:handler contentWorld:WKContentWorld.pageWorld name:@"kiln"];

    NSString *boot = [NSString stringWithFormat:
        @"window.KILN_NATIVE = { platform: 'ios', version: '%@' };",
        [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"1.0"];
    [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:boot
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    config.preferences.javaScriptCanOpenWindowsAutomatically = NO;

    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
    self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.opaque = NO;
    self.webView.backgroundColor = UIColor.systemBackgroundColor;
    self.webView.allowsBackForwardNavigationGestures = NO;
    if (@available(iOS 16.4, *)) {
        self.webView.inspectable = YES;
    }
    [self.view addSubview:self.webView];

    NSString *kilnDir = [NSBundle.mainBundle.bundlePath stringByAppendingPathComponent:@"kiln"];
    NSURL *indexURL = [NSURL fileURLWithPath:[kilnDir stringByAppendingPathComponent:@"index.html"]];
    [self.webView loadFileURL:indexURL allowingReadAccessToURL:[NSURL fileURLWithPath:kilnDir isDirectory:YES]];

    self.navigationItem.leftBarButtonItem = self.splitViewController.displayModeButtonItem;
    self.navigationItem.leftItemsSupplementBackButton = YES;

    // Keep a copy of the Universal JIT script in Documents so it can be
    // assigned by hand in StikDebug if the automatic hand-off is not used.
    NSString *script = [NSBundle.mainBundle pathForResource:@"UniversalJIT26" ofType:@"js"];
    const char *home = getenv("AME_HOME");
    NSString *docs = home ? @(home) : NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    if (script && docs) {
        NSString *dest = [docs stringByAppendingPathComponent:@"UniversalJIT26.js"];
        if (![NSFileManager.defaultManager fileExistsAtPath:dest]) {
            [NSFileManager.defaultManager copyItemAtPath:script toPath:dest error:nil];
        }
    }
}

- (void)viewDidAppear:(BOOL)animated {
    [super viewDidAppear:animated];
    [self emitEvent:@"resume" payload:@{}];
}

#pragma mark - Navigation: keep the UI local, open links outside

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if (url.isFileURL || [url.scheme isEqualToString:@"about"] || [url.scheme isEqualToString:@"blob"] || [url.scheme isEqualToString:@"data"]) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }
    if (url) openLink(self, url);
    decisionHandler(WKNavigationActionPolicyCancel);
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
    forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (navigationAction.request.URL) openLink(self, navigationAction.request.URL);
    return nil;
}

- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    [webView reload];
}

#pragma mark - Events

- (void)emitEvent:(NSString *)name payload:(id)payload {
    NSData *data = [NSJSONSerialization dataWithJSONObject:@{@"name": name, @"payload": payload ?: @{}} options:0 error:nil];
    if (!data) return;
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *js = [NSString stringWithFormat:@"window.__kilnEvent && window.__kilnEvent(%@)", json];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:js completionHandler:nil];
    });
}

#pragma mark - Paths

- (NSString *)gameRoot {
    const char *dir = getenv("GAME_DIR");
    return dir ? @(dir) : [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject stringByAppendingPathComponent:@"minecraft"];
}

// Resolves a path relative to the game folder; rejects anything that escapes it.
- (NSString *)resolve:(id)rel error:(NSString **)error {
    if (![rel isKindOfClass:NSString.class]) {
        if (error) *error = @"Missing path";
        return nil;
    }
    NSString *path = rel;
    if (path.length == 0 || [path hasPrefix:@"/"] || [path containsString:@"\\"]) {
        if (error) *error = [NSString stringWithFormat:@"Invalid path: %@", path];
        return nil;
    }
    for (NSString *part in [path componentsSeparatedByString:@"/"]) {
        if ([part isEqualToString:@".."]) {
            if (error) *error = [NSString stringWithFormat:@"Invalid path: %@", path];
            return nil;
        }
    }
    return [self.gameRoot stringByAppendingPathComponent:path];
}

- (BOOL)ensureParent:(NSString *)path {
    return [NSFileManager.defaultManager createDirectoryAtPath:path.stringByDeletingLastPathComponent
        withIntermediateDirectories:YES attributes:nil error:nil];
}

+ (NSString *)sha1OfFile:(NSString *)path {
    NSInputStream *stream = [NSInputStream inputStreamWithFileAtPath:path];
    if (!stream) return nil;
    [stream open];
    CC_SHA1_CTX ctx;
    CC_SHA1_Init(&ctx);
    uint8_t buffer[65536];
    NSInteger read;
    while ((read = [stream read:buffer maxLength:sizeof(buffer)]) > 0) {
        CC_SHA1_Update(&ctx, buffer, (CC_LONG)read);
    }
    [stream close];
    if (read < 0) return nil;
    unsigned char digest[CC_SHA1_DIGEST_LENGTH];
    CC_SHA1_Final(digest, &ctx);
    NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA1_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA1_DIGEST_LENGTH; i++) [hex appendFormat:@"%02x", digest[i]];
    return hex;
}

#pragma mark - Bridge dispatch

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id _Nullable, NSString * _Nullable))replyHandler {
    NSDictionary *body = [message.body isKindOfClass:NSDictionary.class] ? message.body : @{};
    NSString *method = body[@"method"];
    NSDictionary *params = [body[@"params"] isKindOfClass:NSDictionary.class] ? body[@"params"] : @{};
    KilnReply reply = ^(id result, NSString *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) replyHandler(nil, error);
            else replyHandler(result ?: NSNull.null, nil);
        });
    };
    if (![method isKindOfClass:NSString.class]) {
        reply(nil, @"Missing method");
        return;
    }

    // UI methods run on the main thread
    NSSet *uiMethods = [NSSet setWithArray:@[@"game.launch", @"account.manage", @"native.settings",
        @"native.profiles", @"native.openURL", @"loader.runInstaller", @"file.share", @"file.pick", @"info",
        @"profiles.list", @"profiles.save", @"profiles.delete", @"profiles.select"]];
    if ([uiMethods containsObject:method]) {
        [self handleUI:method params:params reply:reply];
        return;
    }
    dispatch_async(self.ioQueue, ^{
        @try {
            [self handleIO:method params:params reply:reply];
        } @catch (NSException *e) {
            reply(nil, [NSString stringWithFormat:@"%@: %@", e.name, e.reason]);
        }
    });
}

#pragma mark - Main-thread methods

- (LauncherNavigationController *)launcherNav {
    id nav = self.navigationController;
    return [nav isKindOfClass:LauncherNavigationController.class] ? nav : nil;
}

- (LauncherMenuViewController *)menu {
    UINavigationController *master = self.splitViewController.viewControllers.firstObject;
    id vc = master.viewControllers.firstObject;
    return [vc isKindOfClass:LauncherMenuViewController.class] ? vc : nil;
}

- (NSDictionary *)accountInfo {
    NSDictionary *auth = BaseAuthenticator.current.authData;
    if (!auth) return (id)NSNull.null;
    NSString *username = auth[@"username"] ?: @"";
    BOOL demo = [username hasPrefix:@"Demo."];
    NSString *type = demo ? @"demo" : (auth[@"xboxGamertag"] ? @"microsoft" : @"local");
    return @{
        @"name": demo ? [username substringFromIndex:5] : username,
        @"type": type,
        @"avatar": auth[@"profilePicURL"] ?: @""
    };
}

- (NSString *)bundledCurseForgeKey {
    NSString *path = [NSBundle.mainBundle.bundlePath stringByAppendingPathComponent:@"kiln/kiln-config.json"];
    NSData *data = [NSData dataWithContentsOfFile:path];
    if (!data) return @"";
    NSDictionary *cfg = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    NSString *key = [cfg isKindOfClass:NSDictionary.class] ? cfg[@"curseforgeApiKey"] : nil;
    return [key isKindOfClass:NSString.class] ? key : @"";
}

- (void)handleUI:(NSString *)method params:(NSDictionary *)params reply:(KilnReply)reply {
    dispatch_async(dispatch_get_main_queue(), ^{
        if ([method isEqualToString:@"info"]) {
            reply(@{
                @"platform": @"ios",
                @"engine": @"amethyst",
                @"appVersion": [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"",
                @"gameRoot": self.gameRoot,
                @"jit": @(isJITEnabled(false)),
                @"txm": @(DeviceHasJITFlags(JIT_FLAG_HAS_TXM)),
                @"ios26": @(DeviceHasJITFlags(JIT_FLAG_IS_IOS_26)),
                @"account": [self accountInfo],
                @"ramBytes": @(NSProcessInfo.processInfo.physicalMemory),
                @"curseforgeApiKey": [self bundledCurseForgeKey],
                @"device": UIDevice.currentDevice.model ?: @"",
                @"osVersion": UIDevice.currentDevice.systemVersion ?: @""
            }, nil);
        } else if ([method isEqualToString:@"profiles.list"]) {
            [PLProfiles updateCurrent];
            NSDictionary *dict = PLProfiles.current.profileDict ?: @{};
            reply(@{
                @"profiles": dict[@"profiles"] ?: @{},
                @"selected": dict[@"selectedProfile"] ?: NSNull.null
            }, nil);
        } else if ([method isEqualToString:@"profiles.save"]) {
            NSString *key = params[@"key"];
            NSDictionary *profile = params[@"profile"];
            if (![key isKindOfClass:NSString.class] || key.length == 0 || ![profile isKindOfClass:NSDictionary.class]) {
                reply(nil, @"profiles.save needs key and profile");
                return;
            }
            [PLProfiles updateCurrent];
            NSMutableDictionary *profiles = PLProfiles.current.profiles;
            NSMutableDictionary *merged = [(profiles[key] ?: @{}) mutableCopy];
            [merged addEntriesFromDictionary:profile];
            NSString *instanceDir = params[@"instanceDir"];
            if ([instanceDir isKindOfClass:NSString.class] && instanceDir.length > 0) {
                merged[@"gameDir"] = [@"./" stringByAppendingString:instanceDir];
            }
            if (!merged[@"name"]) merged[@"name"] = key;
            profiles[key] = merged;
            if (params[@"select"] && [params[@"select"] boolValue]) {
                PLProfiles.current.profileDict[@"selectedProfile"] = (id)key;
            }
            [PLProfiles.current save];
            [self.launcherNav performSelector:@selector(reloadProfileList)];
            reply(merged, nil);
        } else if ([method isEqualToString:@"profiles.delete"]) {
            NSString *key = params[@"key"];
            [PLProfiles updateCurrent];
            if ([key isKindOfClass:NSString.class]) {
                [PLProfiles.current.profiles removeObjectForKey:key];
                if ([PLProfiles.current.selectedProfileName isEqualToString:key]) {
                    NSString *first = PLProfiles.current.profiles.allKeys.firstObject;
                    PLProfiles.current.profileDict[@"selectedProfile"] = (id)(first ?: @"");
                }
                [PLProfiles.current save];
                [self.launcherNav performSelector:@selector(reloadProfileList)];
            }
            reply(@YES, nil);
        } else if ([method isEqualToString:@"profiles.select"]) {
            NSString *key = params[@"key"];
            [PLProfiles updateCurrent];
            if (![key isKindOfClass:NSString.class] || !PLProfiles.current.profiles[key]) {
                reply(nil, @"Profile not found");
                return;
            }
            PLProfiles.current.selectedProfileName = key;
            [self.launcherNav performSelector:@selector(reloadProfileList)];
            reply(@YES, nil);
        } else if ([method isEqualToString:@"game.launch"]) {
            NSString *key = params[@"key"];
            LauncherNavigationController *nav = self.launcherNav;
            [PLProfiles updateCurrent];
            if (!nav) { reply(nil, @"Launcher is not ready"); return; }
            if (![key isKindOfClass:NSString.class] || !PLProfiles.current.profiles[key]) {
                reply(nil, @"Profile not found");
                return;
            }
            PLProfiles.current.selectedProfileName = key;
            [nav performSelector:@selector(reloadProfileList)];
            id sender = nil;
            @try { sender = [nav valueForKey:@"buttonInstall"]; } @catch (NSException *e) {}
            if (!sender) {
                @try { sender = [nav valueForKey:@"buttonInstallItem"]; } @catch (NSException *e) {}
            }
            if (!sender) { reply(nil, @"Play button not found"); return; }
            [nav performSelector:@selector(performInstallOrShowDetails:) withObject:sender];
            reply(@{@"started": @YES}, nil);
        } else if ([method isEqualToString:@"account.manage"]) {
            LauncherMenuViewController *menu = self.menu;
            if (!menu) { reply(nil, @"Account menu unavailable"); return; }
            [menu selectAccount:menu.accountButton];
            reply(@YES, nil);
        } else if ([method isEqualToString:@"native.settings"]) {
            [self.navigationController pushViewController:[LauncherPreferencesViewController new] animated:YES];
            reply(@YES, nil);
        } else if ([method isEqualToString:@"native.profiles"]) {
            [self.navigationController pushViewController:[LauncherProfilesViewController new] animated:YES];
            reply(@YES, nil);
        } else if ([method isEqualToString:@"native.openURL"]) {
            NSURL *url = [NSURL URLWithString:params[@"url"] ?: @""];
            if (url && ([url.scheme isEqualToString:@"https"] || [url.scheme isEqualToString:@"http"])) {
                openLink(self, url);
                reply(@YES, nil);
            } else {
                reply(nil, @"Only http(s) links can be opened");
            }
        } else if ([method isEqualToString:@"loader.runInstaller"]) {
            NSString *error;
            NSString *path = [self resolve:params[@"path"] error:&error];
            if (!path) { reply(nil, error); return; }
            if (![NSFileManager.defaultManager fileExistsAtPath:path]) { reply(nil, @"Installer not found"); return; }
            LauncherNavigationController *nav = self.launcherNav;
            if (!nav) { reply(nil, @"Launcher is not ready"); return; }
            [nav enterModInstallerWithPath:path hitEnterAfterWindowShown:YES];
            reply(@{@"started": @YES, @"restartRequired": @YES}, nil);
        } else if ([method isEqualToString:@"file.share"]) {
            NSString *error;
            NSString *path = [self resolve:params[@"path"] error:&error];
            if (!path) { reply(nil, error); return; }
            UIActivityViewController *vc = [[UIActivityViewController alloc]
                initWithActivityItems:@[[NSURL fileURLWithPath:path]] applicationActivities:nil];
            vc.popoverPresentationController.sourceView = self.view;
            vc.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(self.view.bounds), CGRectGetMidY(self.view.bounds), 1, 1);
            [self presentViewController:vc animated:YES completion:nil];
            reply(@YES, nil);
        } else if ([method isEqualToString:@"file.pick"]) {
            if (self.pickReply) self.pickReply(NSNull.null, nil);
            self.pickReply = reply;
            NSMutableArray *types = [NSMutableArray arrayWithObject:UTTypeZIP];
            UTType *jar = [UTType typeWithFilenameExtension:@"jar"];
            if (jar) [types addObject:jar];
            [types addObject:UTTypeData];
            UIDocumentPickerViewController *picker = [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:types asCopy:YES];
            picker.delegate = self;
            picker.allowsMultipleSelection = [params[@"multiple"] boolValue];
            [self presentViewController:picker animated:YES completion:nil];
        } else {
            reply(nil, [NSString stringWithFormat:@"Unknown method %@", method]);
        }
    });
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls {
    KilnReply reply = self.pickReply;
    self.pickReply = nil;
    if (!reply) return;
    NSMutableArray *out = [NSMutableArray new];
    NSString *importDir = [self.gameRoot stringByAppendingPathComponent:@"kiln/_import"];
    [NSFileManager.defaultManager createDirectoryAtPath:importDir withIntermediateDirectories:YES attributes:nil error:nil];
    for (NSURL *url in urls) {
        NSString *name = url.lastPathComponent;
        NSString *dest = [importDir stringByAppendingPathComponent:name];
        [NSFileManager.defaultManager removeItemAtPath:dest error:nil];
        NSError *error;
        if ([NSFileManager.defaultManager copyItemAtURL:url toURL:[NSURL fileURLWithPath:dest] error:&error]) {
            NSDictionary *attrs = [NSFileManager.defaultManager attributesOfItemAtPath:dest error:nil];
            [out addObject:@{@"path": [@"kiln/_import" stringByAppendingPathComponent:name], @"name": name, @"size": attrs[NSFileSize] ?: @0}];
        }
    }
    reply(out, nil);
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller {
    KilnReply reply = self.pickReply;
    self.pickReply = nil;
    if (reply) reply(@[], nil);
}

#pragma mark - Background methods

- (void)handleIO:(NSString *)method params:(NSDictionary *)params reply:(KilnReply)reply {
    NSFileManager *fm = NSFileManager.defaultManager;
    NSString *error = nil;

    if ([method isEqualToString:@"http"]) {
        NSURL *url = [NSURL URLWithString:params[@"url"] ?: @""];
        if (!url || !([url.scheme isEqualToString:@"https"] || [url.scheme isEqualToString:@"http"])) {
            reply(nil, @"http needs an http(s) url");
            return;
        }
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
        request.HTTPMethod = [params[@"method"] isKindOfClass:NSString.class] ? params[@"method"] : @"GET";
        request.timeoutInterval = 45;
        NSDictionary *headers = params[@"headers"];
        if ([headers isKindOfClass:NSDictionary.class]) {
            for (NSString *key in headers) {
                if ([headers[key] isKindOfClass:NSString.class]) [request setValue:headers[key] forHTTPHeaderField:key];
            }
        }
        if ([params[@"body"] isKindOfClass:NSString.class]) {
            request.HTTPBody = [params[@"body"] dataUsingEncoding:NSUTF8StringEncoding];
        }
        [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
            if (err) {
                reply(nil, err.localizedDescription);
                return;
            }
            NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
            NSString *text = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"";
            if (!text) text = [[NSString alloc] initWithData:data encoding:NSISOLatin1StringEncoding] ?: @"";
            reply(@{
                @"status": @(http.statusCode),
                @"body": text,
                @"headers": http.allHeaderFields ?: @{}
            }, nil);
        }] resume];
    } else if ([method isEqualToString:@"download"]) {
        NSURL *url = [NSURL URLWithString:params[@"url"] ?: @""];
        NSString *dest = [self resolve:params[@"path"] error:&error];
        if (!dest) { reply(nil, error); return; }
        if (!url || ![url.scheme hasPrefix:@"http"]) { reply(nil, @"download needs an http(s) url"); return; }
        NSString *sha1 = [params[@"sha1"] isKindOfClass:NSString.class] ? [params[@"sha1"] lowercaseString] : nil;
        // Skip when the file is already there with the right hash
        if (sha1.length > 0 && [fm fileExistsAtPath:dest] && [[KilnViewController sha1OfFile:dest] isEqualToString:sha1]) {
            NSDictionary *attrs = [fm attributesOfItemAtPath:dest error:nil];
            reply(@{@"path": params[@"path"], @"size": attrs[NSFileSize] ?: @0, @"cached": @YES}, nil);
            return;
        }
        KilnDownload *record = [KilnDownload new];
        record.taskId = [params[@"taskId"] isKindOfClass:NSString.class] ? params[@"taskId"] : NSUUID.UUID.UUIDString;
        record.destPath = dest;
        record.relPath = params[@"path"];
        record.sha1 = sha1;
        record.reply = reply;
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
        [request setValue:@"Kiln/1.0 (Amethyst iOS)" forHTTPHeaderField:@"User-Agent"];
        NSURLSessionDownloadTask *task = [self.downloadSession downloadTaskWithRequest:request];
        @synchronized (self.downloads) {
            self.downloads[@(task.taskIdentifier)] = record;
        }
        [task resume];
    } else if ([method isEqualToString:@"fs.list"]) {
        NSString *path = [params[@"path"] length] ? [self resolve:params[@"path"] error:&error] : self.gameRoot;
        if (!path) { reply(nil, error); return; }
        NSArray *names = [fm contentsOfDirectoryAtPath:path error:nil] ?: @[];
        NSMutableArray *out = [NSMutableArray new];
        for (NSString *name in names) {
            NSString *full = [path stringByAppendingPathComponent:name];
            NSDictionary *attrs = [fm attributesOfItemAtPath:full error:nil];
            BOOL dir = [attrs[NSFileType] isEqualToString:NSFileTypeDirectory];
            [out addObject:@{
                @"name": name,
                @"dir": @(dir),
                @"size": attrs[NSFileSize] ?: @0,
                @"mtime": @([attrs[NSFileModificationDate] timeIntervalSince1970] * 1000)
            }];
        }
        reply(out, nil);
    } else if ([method isEqualToString:@"fs.readText"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        NSString *text = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
        reply(text ?: (id)NSNull.null, nil);
    } else if ([method isEqualToString:@"fs.writeText"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        [self ensureParent:path];
        NSError *err;
        NSString *text = [params[@"text"] isKindOfClass:NSString.class] ? params[@"text"] : @"";
        if (![text writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&err]) {
            reply(nil, err.localizedDescription);
            return;
        }
        reply(@YES, nil);
    } else if ([method isEqualToString:@"fs.writeBase64"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        NSData *data = [[NSData alloc] initWithBase64EncodedString:([params[@"data"] isKindOfClass:NSString.class] ? params[@"data"] : @"") options:NSDataBase64DecodingIgnoreUnknownCharacters];
        if (!data) { reply(nil, @"Invalid base64 data"); return; }
        [self ensureParent:path];
        NSError *err;
        if (![data writeToFile:path options:NSDataWritingAtomic error:&err]) { reply(nil, err.localizedDescription); return; }
        reply(@{@"size": @(data.length)}, nil);
    } else if ([method isEqualToString:@"fs.delete"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        [fm removeItemAtPath:path error:nil];
        reply(@YES, nil);
    } else if ([method isEqualToString:@"fs.rename"]) {
        NSString *from = [self resolve:params[@"from"] error:&error];
        NSString *to = from ? [self resolve:params[@"to"] error:&error] : nil;
        if (!from || !to) { reply(nil, error); return; }
        [self ensureParent:to];
        [fm removeItemAtPath:to error:nil];
        NSError *err;
        if (![fm moveItemAtPath:from toPath:to error:&err]) { reply(nil, err.localizedDescription); return; }
        reply(@YES, nil);
    } else if ([method isEqualToString:@"fs.copy"]) {
        NSString *from = [self resolve:params[@"from"] error:&error];
        NSString *to = from ? [self resolve:params[@"to"] error:&error] : nil;
        if (!from || !to) { reply(nil, error); return; }
        [self ensureParent:to];
        [fm removeItemAtPath:to error:nil];
        NSError *err;
        if (![fm copyItemAtPath:from toPath:to error:&err]) { reply(nil, err.localizedDescription); return; }
        reply(@YES, nil);
    } else if ([method isEqualToString:@"fs.exists"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        BOOL dir = NO;
        BOOL exists = [fm fileExistsAtPath:path isDirectory:&dir];
        reply(@{@"exists": @(exists), @"dir": @(dir)}, nil);
    } else if ([method isEqualToString:@"fs.mkdir"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        [fm createDirectoryAtPath:path withIntermediateDirectories:YES attributes:nil error:nil];
        reply(@YES, nil);
    } else if ([method isEqualToString:@"fs.sha1"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        reply([KilnViewController sha1OfFile:path] ?: (id)NSNull.null, nil);
    } else if ([method isEqualToString:@"zip.readText"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        NSError *err;
        UZKArchive *archive = [[UZKArchive alloc] initWithPath:path error:&err];
        if (!archive) { reply(nil, err.localizedDescription ?: @"Cannot open zip"); return; }
        NSData *data = [archive extractDataFromFile:params[@"entry"] error:&err];
        if (!data) { reply(NSNull.null, nil); return; }
        reply([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: (id)NSNull.null, nil);
    } else if ([method isEqualToString:@"zip.list"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        if (!path) { reply(nil, error); return; }
        NSError *err;
        UZKArchive *archive = [[UZKArchive alloc] initWithPath:path error:&err];
        NSArray *names = archive ? [archive listFilenames:&err] : nil;
        if (!names) { reply(nil, err.localizedDescription ?: @"Cannot read zip"); return; }
        reply(names, nil);
    } else if ([method isEqualToString:@"zip.extract"]) {
        NSString *path = [self resolve:params[@"path"] error:&error];
        NSString *dest = path ? [self resolve:params[@"dest"] error:&error] : nil;
        if (!path || !dest) { reply(nil, error); return; }
        NSString *prefix = [params[@"prefix"] isKindOfClass:NSString.class] ? params[@"prefix"] : @"";
        while ([prefix hasSuffix:@"/"]) prefix = [prefix substringToIndex:prefix.length - 1];
        NSError *err;
        UZKArchive *archive = [[UZKArchive alloc] initWithPath:path error:&err];
        if (!archive) { reply(nil, err.localizedDescription ?: @"Cannot open zip"); return; }
        [fm createDirectoryAtPath:dest withIntermediateDirectories:YES attributes:nil error:nil];
        if (prefix.length > 0) {
            [ModpackUtils archive:archive extractDirectory:prefix toPath:dest error:&err];
        } else {
            [archive extractFilesTo:dest overwrite:YES error:&err];
        }
        if (err) { reply(nil, err.localizedDescription); return; }
        reply(@YES, nil);
    } else {
        reply(nil, [NSString stringWithFormat:@"Unknown method %@", method]);
    }
}

#pragma mark - NSURLSessionDownloadDelegate

- (KilnDownload *)recordForTask:(NSURLSessionTask *)task remove:(BOOL)remove {
    @synchronized (self.downloads) {
        KilnDownload *record = self.downloads[@(task.taskIdentifier)];
        if (remove) [self.downloads removeObjectForKey:@(task.taskIdentifier)];
        return record;
    }
}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask
      didWriteData:(int64_t)bytesWritten totalBytesWritten:(int64_t)totalBytesWritten
totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {
    KilnDownload *record = [self recordForTask:downloadTask remove:NO];
    if (!record) return;
    CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
    if (now - record.lastEmit < 0.25) return;
    record.lastEmit = now;
    [self emitEvent:@"download.progress" payload:@{
        @"taskId": record.taskId,
        @"received": @(totalBytesWritten),
        @"total": @(totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : 0)
    }];
}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask
didFinishDownloadingToURL:(NSURL *)location {
    KilnDownload *record = [self recordForTask:downloadTask remove:NO];
    if (!record) return;
    NSHTTPURLResponse *http = (NSHTTPURLResponse *)downloadTask.response;
    if ([http isKindOfClass:NSHTTPURLResponse.class] && (http.statusCode < 200 || http.statusCode >= 300)) {
        [self recordForTask:downloadTask remove:YES];
        record.reply(nil, [NSString stringWithFormat:@"HTTP %ld for %@", (long)http.statusCode, downloadTask.originalRequest.URL.lastPathComponent]);
        return;
    }
    // The temp file disappears after this method returns, so move it now.
    NSString *partial = [record.destPath stringByAppendingString:@".part"];
    [self ensureParent:record.destPath];
    [NSFileManager.defaultManager removeItemAtPath:partial error:nil];
    NSError *err;
    if (![NSFileManager.defaultManager moveItemAtURL:location toURL:[NSURL fileURLWithPath:partial] error:&err]) {
        [self recordForTask:downloadTask remove:YES];
        record.reply(nil, err.localizedDescription);
        return;
    }
    if (record.sha1.length > 0) {
        NSString *actual = [KilnViewController sha1OfFile:partial];
        if (![actual isEqualToString:record.sha1]) {
            [NSFileManager.defaultManager removeItemAtPath:partial error:nil];
            [self recordForTask:downloadTask remove:YES];
            record.reply(nil, [NSString stringWithFormat:@"Checksum mismatch for %@", record.relPath.lastPathComponent]);
            return;
        }
    }
    [NSFileManager.defaultManager removeItemAtPath:record.destPath error:nil];
    if (![NSFileManager.defaultManager moveItemAtPath:partial toPath:record.destPath error:&err]) {
        [self recordForTask:downloadTask remove:YES];
        record.reply(nil, err.localizedDescription);
        return;
    }
    NSDictionary *attrs = [NSFileManager.defaultManager attributesOfItemAtPath:record.destPath error:nil];
    [self recordForTask:downloadTask remove:YES];
    [self emitEvent:@"download.progress" payload:@{@"taskId": record.taskId, @"received": attrs[NSFileSize] ?: @0, @"total": attrs[NSFileSize] ?: @0, @"done": @YES}];
    record.reply(@{@"path": record.relPath, @"size": attrs[NSFileSize] ?: @0}, nil);
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    if (!error) return;
    KilnDownload *record = [self recordForTask:task remove:YES];
    if (record) record.reply(nil, error.localizedDescription);
}

@end
