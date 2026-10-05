package dev.logan.beyondthreshold.client;

/** Mutable client-side state fed by the S2C packets. */
public final class BTTClientState {
	public static boolean glassesWorn = false;
	public static boolean thresholdActive = false;
	/** -1 off, 0 realism, 1 psychedelic, 2 blobs, 3 backrooms, 4 aurora, 5 quantum */
	public static int mandelaMode = -1;
	/** eye intro: -1 idle, 0 eye appears, 1 grabbed, 2 released */
	public static int sequenceStage = -1;
	public static int sequenceTick = 0;
	public static float flash = 0.0F;
	public static float shake = 0.0F;
	public static boolean shrunk = false;
	public static int travelDim = -1;
	public static long travelSeed = 0;
	public static int travelFlash = 0;

	public static final String[] MANDELA_NAMES = {
			"realism", "psychedelic", "blobs", "backrooms", "aurora", "quantum"
	};

	public static void reset() {
		glassesWorn = false;
		thresholdActive = false;
		mandelaMode = -1;
		sequenceStage = -1;
		sequenceTick = 0;
		flash = 0.0F;
		shake = 0.0F;
	}

	private BTTClientState() {
	}
}
