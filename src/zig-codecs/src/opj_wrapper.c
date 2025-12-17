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
