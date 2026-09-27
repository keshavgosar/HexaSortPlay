/**
 * EndCard.ts
 * ---------------------------------------------------------
 * The mandatory "strong CTA" screen every ad-network reviewer
 * checks for. Shows the app icon, logo, and a big Play Now /
 * Install Now button that opens the store listing.
 *
 * Wire the storeUrl to the Play Store link from the brief:
 * https://play.google.com/store/apps/details?id=com.gamebrain.hexasort
 *
 * IMPORTANT for playable ad networks (Meta, Google, ironSource,
 * Mintegral, Vungle...): they each inject their OWN click handler
 * for "install now" - do NOT hardcode window.open on the final
 * build, use their SDK bridge instead (see README, step 7).
 * openStoreUrl() below is the fallback used when you preview the
 * .html file directly in a browser.
 */
import { _decorator, Component, Node, Button, tween, Vec3, UIOpacity } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('EndCard')
export class EndCard extends Component {

    @property(Node)
    panel: Node | null = null; // root node of the end card UI, inactive by default

    @property(Button)
    ctaButton: Button | null = null;

    @property
    storeUrl = 'https://play.google.com/store/apps/details?id=com.gamebrain.hexasort';

    onLoad() {
        this.panel && (this.panel.active = false);
        this.ctaButton?.node.on(Button.EventType.CLICK, this.onCtaClicked, this);
    }

    show() {
        if (!this.panel) return;
        this.panel.active = true;
        this.panel.scale = new Vec3(0.85, 0.85, 0.85);
        const opacity = this.panel.getComponent(UIOpacity) || this.panel.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(this.panel).to(0.25, { scale: new Vec3(1, 1, 1) }).start();
        tween(opacity).to(0.25, { opacity: 255 }).start();
    }

    private onCtaClicked() {
        // Preferred: call the ad network's bridge if it exists, e.g.:
        //   (window as any).mraid?.open(this.storeUrl);
        //   (window as any).ExitApi?.exit();
        // Fallback for local browser preview:
        const w = window as any;
        if (w.mraid && typeof w.mraid.open === 'function') {
            w.mraid.open(this.storeUrl);
        } else if (w.dapi && typeof w.dapi.exit === 'function') {
            w.dapi.exit();
        } else {
            window.open(this.storeUrl, '_blank');
        }
    }
}
