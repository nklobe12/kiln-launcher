#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

// Kiln: the CurseForge-style home screen. Hosts web/index.html in a WKWebView
// and exposes a small native bridge (window.webkit.messageHandlers.kiln) that
// the web UI uses for HTTP without CORS, file access inside the game folder,
// zip extraction, launcher profiles, the Forge/NeoForge installer and launching.
@interface KilnViewController : UIViewController

- (NSString *)imageName;
// Sends an event to the web UI: window.__kilnEvent(name, payload)
- (void)emitEvent:(NSString *)name payload:(id)payload;

@end
