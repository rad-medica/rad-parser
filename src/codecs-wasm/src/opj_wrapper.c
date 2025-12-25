#include "openjpeg.h"
#include <stdlib.h>
#include <string.h>

void* wrapper_create_cparameters() {
    return malloc(sizeof(opj_cparameters_t));
}

void wrapper_destroy_cparameters(void* ptr) {
    free(ptr);
}

void wrapper_set_default_encoder_parameters(void* ptr) {
    opj_set_default_encoder_parameters((opj_cparameters_t*)ptr);
}

void wrapper_setup_encoder_parameters(void* ptr, int mct, int lossless) {
    opj_cparameters_t* params = (opj_cparameters_t*)ptr;

    if (mct) {
        params->tcp_mct = 1;
    }

    if (lossless) {
        params->tcp_numlayers = 1;
        params->tcp_rates[0] = 0;
        params->cp_disto_alloc = 1;
    }
}

void wrapper_set_lossy_parameters(void* ptr, float quality_rate) {
    opj_cparameters_t* params = (opj_cparameters_t*)ptr;
    params->tcp_numlayers = 1;
    params->tcp_rates[0] = quality_rate > 0.0f ? quality_rate : 0.75f; // Default 0.75 rate (better quality)
    params->cp_disto_alloc = 0;
}
