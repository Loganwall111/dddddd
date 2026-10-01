package dev.logan.entersift;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RiftCrossingTest {
    private static boolean cross(double x0,double y0,double z0,double x1,double y1,double z1,double yaw) {
        return RiftCrossing.crosses(RiftType.SIFT,7,5,yaw,x0,y0,z0,x1,y1,z1);
    }
    @Test void proximityDoesNotCount() {
        assertFalse(cross(0,1,2,0,1,1,0));
        assertFalse(cross(0,1,0.5,0,1,0.5,0));
        assertFalse(cross(-1,1,1,1,1,1,0));
    }
    @Test void crossingWorksInBothDirectionsAndAtSprintSpeed() {
        assertTrue(cross(0,1,1,0,1,0,0));
        assertTrue(cross(0,1,0,0,1,1,0));
        assertTrue(cross(0,1,3,0,1,-3,0));
    }
    @Test void noTravelOutsideTheVisibleSilhouette() {
        assertFalse(cross(4,1,1,4,1,0,0));
        assertFalse(cross(0,0.1,1,0,0.1,0,0));
        assertFalse(cross(0,6,1,0,6,0,0));
        assertFalse(cross(2.5,4.8,1,2.5,4.8,0,0));
    }
    @Test void ignoreDiscontinuousTeleportAndInvalidValues() {
        assertFalse(cross(0,1,30,0,1,-30,0));
        assertFalse(cross(Double.NaN,1,1,0,1,0,0));
        assertFalse(cross(0,1,1,0,1,0,Double.NaN));
    }
    @Test void everyYawMatchesTheRenderTransform() {
        for (double yaw : new double[]{0,45,90,135,180,270,359}) {
            double angle = Math.toRadians(-yaw+180);
            double ax = Math.sin(angle)*-1, az = Math.cos(angle)*-1;
            assertTrue(cross(ax,1,az,0,1,0,yaw),"yaw="+yaw);
        }
    }
    @Test void everyBodyCellUsesItsOwnDepth() {
        for (var type : new RiftType[]{RiftType.SIFT,RiftType.OVERWORLD,RiftType.NETHER,RiftType.END}) {
            for (int i=0;i<11;i++) for(int j=0;j<8;j++) {
                double x = -(-3.5+(i+0.5)*7/11), y=RiftCrossing.BASE+(j+0.5)*5/8;
                double z=RiftCrossing.depth(type,i,j);
                assertEquals(RiftCrossing.cell(type,i,j),RiftCrossing.crosses(type,7,5,0,x,y,z+0.03,x,y,z-0.03),type+" "+i+","+j);
            }
        }
    }
}
